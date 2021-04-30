/** ========================================================================
Copyright 2019 T-Mobile, USA

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
See the LICENSE file for additional language around disclaimer of warranties.

Trademark Disclaimer: Neither the name of “T-Mobile, USA” nor the names of
its contributors may be used to endorse or promote products derived from this
software without specific prior written permission.
===========================================================================
*/

import { Injectable } from "@angular/core";
import * as path from "path";
import * as HttpErrors from "http-errors";
import { TreeDescription, CommitDescription } from "isomorphic-git";
import * as _ from "lodash";

import { percyConfig } from "config";
import { User, Authenticate, Principal, RepoMetadata } from "models/auth";
import { TreeNode } from "models/tree-node";
import { ConfigFile, ConflictFile, FileTypes } from "models/config-file";
import { UtilService, git, FS } from "./util.service";
import { MaintenanceService } from "./maintenance.service";

export class PathFinder {
  public readonly repoDir: string;
  public readonly repoAppDir: string;
  public readonly repoFilePath: string;
  public readonly fullFilePath: string;

  public readonly draftDir: string;
  public readonly draftAppDir: string;
  public readonly draftFullFilePath: string;

  static getRepoDir(user: User) {
    return path.resolve(percyConfig.reposFolder, user.repoFolder);
  }

  constructor(public user: User, public file: ConfigFile, branch: string) {
    this.repoDir = PathFinder.getRepoDir(this.user);

    this.draftDir = path.resolve(
      percyConfig.draftFolder,
      this.user.repoFolder,
      branch
    );

    switch (file.applicationName) {
      case "":
        this.repoAppDir = this.repoDir;
        this.repoFilePath = this.file.fileName;
        this.draftAppDir = this.draftDir;
        break;

      case percyConfig.yamlAppsFolder:
        this.repoAppDir = path.resolve(
          this.repoDir,
          percyConfig.yamlAppsFolder
        );
        this.repoFilePath = path.join(
          percyConfig.yamlAppsFolder,
          this.file.fileName
        );
        this.draftAppDir = path.resolve(
          this.draftDir,
          percyConfig.yamlAppsFolder
        );
        break;

      default:
        this.repoAppDir = path.resolve(
          this.repoDir,
          percyConfig.yamlAppsFolder,
          this.file.applicationName
        );
        this.repoFilePath = path.join(
          percyConfig.yamlAppsFolder,
          this.file.applicationName,
          this.file.fileName
        );
        this.draftAppDir = path.resolve(
          this.draftDir,
          percyConfig.yamlAppsFolder,
          this.file.applicationName
        );
        break;
    }

    this.fullFilePath = path.resolve(this.repoAppDir, this.file.fileName);

    this.draftFullFilePath = path.resolve(this.draftAppDir, this.file.fileName);
  }
}

/**
 * This service provides the methods around the file management API endpoints
 */
@Injectable({ providedIn: "root" })
export class FileManagementService {
  /**
   * initializes the service
   *
   * @param utilService the util service
   * @param maintenanceService the maintenance service
   */
  constructor(
    private utilService: UtilService,
    private maintenanceService: MaintenanceService
  ) {}

  /**
   * access the repository and receives the security token to be used in subsequent requests
   *
   * @param auth the authenticate request
   * @param repo the repo
   */
  async accessRepo(auth: Authenticate) {
    const fs = await this.utilService.getBrowserFS();

    const { repoName, repoFolder } = this.utilService.getRepoFolder(auth);

    const repoDir = path.resolve(percyConfig.reposFolder, repoFolder);
    const repoMetadataFile = this.utilService.getMetadataPath(repoFolder);

    let existingRepoMetadata: RepoMetadata;
    if (await fs.pathExists(repoDir)) {
      // Check repo metadata file
      if (await fs.pathExists(repoMetadataFile)) {
        try {
          existingRepoMetadata = await fs.readJson(repoMetadataFile);
          if (
            existingRepoMetadata.version !== percyConfig.repoMetadataVersion
          ) {
            existingRepoMetadata = null;
          }
        } catch (err) {
          console.warn(
            `${repoDir} exists but medata is broken, will clone again`
          );
        }
      } else {
        console.warn(
          `${repoDir} exists but metadata missing, will clone again`
        );
      }

      if (!existingRepoMetadata) {
        await fs.remove(repoDir);
      }
    }

    const branchName = "master";

    try {
      if (!existingRepoMetadata) {
        try {
          // Clone repo. We do a noCheckout action, for performance reason (less files, less I/O).
          // The repo will only contain the '.git' folder, nothing else.
          // The file content will directly be read from pack files in '.git', by using git.readObject.
          await git.clone({
            url: auth.repositoryUrl,
            username: auth.username,
            password: auth.password,
            dir: repoDir,
            ref: branchName,
            depth: 1, // Shallow clone repo with --depth as 1
            noCheckout: true, // No checkout
            corsProxy: percyConfig.corsProxy
          });
        } catch (err) {
          // If error while clone remove the repo dir
          await fs.remove(repoDir);
          throw err;
        }
      } else {
        // Fetch new commits for all branches
        await this.fetchAllBranches(auth, repoDir, existingRepoMetadata);
      }
    } catch (error) {
      throw this.utilService.convertGitError(error);
    }

    const draftFolder = path.resolve(percyConfig.draftFolder, repoFolder);
    await fs.ensureDir(draftFolder);

    await this.maintenanceService.addUserName(auth.username);

    // In case of pull, remember the existing commit base SHAs
    const commitBaseSHA = existingRepoMetadata
      ? existingRepoMetadata.commitBaseSHA || {}
      : {};

    // Create token payload
    const tokenPayload: any = {
      username: auth.username,
      iat: Date.now()
    };

    const user: User = {
      ...auth,
      branchName,
      password: this.utilService.encrypt(auth.password),
      repoName,
      repoFolder,
      token: this.utilService.encrypt(JSON.stringify(tokenPayload))
    };

    // Save user to repo metadata locally
    await fs.outputJson(repoMetadataFile, {
      ...user,
      commitBaseSHA,
      version: percyConfig.repoMetadataVersion
    });

    return user;
  }

  /**
   * Fetch new commits for all branches.
   *
   * Similar as clone, we never checkout, just fetch from remote repo.
   *
   * @param auth the authenticate
   * @param repoDir the repo dir
   * @param repoMetadata the repo metadata
   * @returns flag indicates whether master is changed and flag indicates whether current branch is deleted in remote repo
   */
  private async fetchAllBranches(
    auth: Authenticate,
    repoDir: string,
    repoMetadata: RepoMetadata
  ) {
    const { changed: masterChanged } = await this.fetchBranch(
      auth,
      repoDir,
      "master",
      false
    );

    const fetchedBranches = await git.listBranches({
      dir: repoDir,
      remote: "origin"
    });

    const remoteBranches = await this.getRemoteBranches(auth);

    const currentBranchDeleted =
      remoteBranches.indexOf(repoMetadata.branchName) === -1;
    const deletedBranches = _.difference(fetchedBranches, remoteBranches);

    const fs = await this.utilService.getBrowserFS();

    for (const deletedBranch of deletedBranches) {
      await git.deleteRef({
        dir: repoDir,
        ref: `refs/heads/${deletedBranch}`
      });
      await git.deleteRef({
        dir: repoDir,
        ref: `refs/remotes/origin/${deletedBranch}`
      });
      await fs.remove(
        path.resolve(
          percyConfig.draftFolder,
          repoMetadata.repoFolder,
          deletedBranch
        )
      );
      await this.saveCommitBaseSHA(fs, repoMetadata, {}, deletedBranch);
    }

    return { masterChanged, currentBranchDeleted };
  }

  /**
   * Get remote branches.
   */
  private async getRemoteBranches(auth: Authenticate) {
    const remoteInfo = await git.getRemoteInfo({
      url: auth.repositoryUrl,
      username: auth.username,
      password: auth.password,
      corsProxy: percyConfig.corsProxy
    });

    const flat = (obj: any, paths = []) =>
      !_.isObject(obj)
        ? { [paths.join("/")]: obj }
        : _.reduce(
            obj,
            (cum, next, key) => _.merge(cum, flat(next, [...paths, key])),
            {}
          );

    const remoteBranches = _.keys(flat(remoteInfo.refs.heads));
    remoteBranches.push("HEAD");

    return remoteBranches;
  }

  /**
   * Fetch branch's new commit.
   *
   * Similar as clone, we never checkout, just fetch from remote repo.
   *
   * @param auth the authenticate
   * @param repoDir the repo dir
   * @param branch the branch to refresh
   * @param singleBranch the flag indicates whether to fetch given branch only, or to fetch all branches
   * @returns new commit and flag indicates whether branch is changed
   */
  private async fetchBranch(
    auth: Authenticate,
    repoDir: string,
    branch: string,
    singleBranch: boolean
  ) {
    const lastCommit = await this.getRemoteCommit(repoDir, branch);

    // Fetch new commit
    try {
      await git.fetch({
        username: auth.username,
        password: auth.password,
        dir: repoDir,
        ref: branch,
        singleBranch,
        // depth: 1,
        corsProxy: percyConfig.corsProxy
      });
    } catch (err) {
      if (err.code === git.E.ResolveRefError) {
        console.warn(
          `ResolveRefError when fetching ${branch}, maybe remote branch has been deleted`
        );
        return { pulledCommit: lastCommit, changed: false };
      }
      throw err;
    }

    const pulledCommit = await this.syncHeadCommit(repoDir, branch);

    return { pulledCommit, changed: lastCommit !== pulledCommit };
  }

  /**
   * list branch names (both local and remote).
   *
   * @param user the logged in user pricipal
   * @returns array of branches
   */
  async listBranches(principal: Principal) {
    const { user } = await this.maintenanceService.checkSessionTimeout(
      principal
    );
    const repoDir = PathFinder.getRepoDir(user);

    const localBranches = await git.listBranches({
      dir: repoDir
    });
    const remoteBranches = await git.listBranches({
      dir: repoDir,
      remote: "origin"
    });

    const filterBranches = (branches: string[]) =>
      branches.filter(
        b => b !== "HEAD" && percyConfig.lockedBranches.indexOf(b) < 0
      );
    return _.union(
      filterBranches(localBranches),
      filterBranches(remoteBranches)
    ).sort();
  }

  /**
   * Checkout branch.
   *
   * @param user the logged in user pricipal
   * @param type the type, either 'switch' or 'create'
   * @param branch the branch to swtich to
   */
  async checkoutBranch(principal: Principal, type: string, branch: string) {
    const { user } = await this.maintenanceService.checkSessionTimeout(
      principal
    );

    const fs = await this.utilService.getBrowserFS();
    const repoDir = PathFinder.getRepoDir(user);

    if (type === "create") {
      // Refresh all branches
      const remoteBranches = await this.getRemoteBranches(user);
      if (remoteBranches.indexOf(branch) >= 0) {
        throw new Error(`${branch} already exists`);
      }

      // when create new branch, based off on 'master'
      const commit = await this.syncHeadCommit(repoDir, "master", branch);
      const previsouBranch = await git.currentBranch({ dir: repoDir });
      await this.writeHeadRef(repoDir, branch);

      try {
        await this.doPush(fs, user, repoDir, branch, commit, async () => await git.commit({
            dir: repoDir,
            message: `[Percy] Create Branch ${branch}`,
            author: {
              name: user.username,
              email: user.username
            }
          }));
      } catch (err) {
        await this.writeHeadRef(repoDir, previsouBranch);
        await git.deleteRef({
          dir: repoDir,
          ref: `refs/heads/${branch}`
        });
        throw err;
      }
    } else {
      await this.syncHeadCommit(repoDir, branch);
      await this.writeHeadRef(repoDir, branch);
    }

    await git.config({
      dir: repoDir,
      path: `branch.${branch}.merge`,
      value: `refs/heads/${branch}`
    });
    await git.config({
      dir: repoDir,
      path: `branch.${branch}.remote`,
      value: "origin"
    });

    const { repoFolder } = this.utilService.getRepoFolder(user);

    const repoMetadataFile = this.utilService.getMetadataPath(repoFolder);
    const repoMetadata: RepoMetadata = await fs.readJson(repoMetadataFile);
    repoMetadata.branchName = branch;

    await fs.outputJson(repoMetadataFile, repoMetadata);
  }

  /**
   * Get file key, which is app name plus file name.
   */
  private fileKey(file: ConfigFile) {
    return `${file.applicationName}/${file.fileName}`;
  }

  /**
   * Flat the app categorized files.
   */
  private flatFiles(files: { [app: string]: ConfigFile[] }) {
    return _.reduce(
      files,
      (r, v) => {
        _.each(v, f => {
          r[this.fileKey(f)] = f;
        });
        return r;
      },
      {} as { [key: string]: ConfigFile }
    );
  }

  /**
   * Get diff of branch files.
   */
  private diffBranchFiles(
    leftFiles: { [key: string]: ConfigFile },
    rightFiles: { [key: string]: ConfigFile }
  ) {
    const leftKeys = _.keys(leftFiles);
    const rightKeys = _.keys(rightFiles);

    const onlyInLeftKeys = _.difference(leftKeys, rightKeys);
    const onlyInRightKeys = _.difference(rightKeys, leftKeys);
    const intersect = _.intersection(leftKeys, rightKeys);

    const onlyInLeft = _.map(onlyInLeftKeys, key => leftFiles[key]);
    const onlyInRight = _.map(onlyInRightKeys, key => rightFiles[key]);
    const modified: ConfigFile[][] = [];
    _.each(intersect, key => {
      if (leftFiles[key].oid !== rightFiles[key].oid) {
        modified.push([leftFiles[key], rightFiles[key]]);
      }
    });
    return { onlyInLeft, onlyInRight, modified };
  }

  /**
   * Find merge base of two commits. Will return null if not found (highly possible due to shallow clone).
   */
  private async findMergeBase(
    repoDir: string,
    srcCommitOid: string,
    targetCommitOid: string
  ) {
    const srcHistory = [srcCommitOid];
    const targetHistory = [targetCommitOid];

    const walkHistroy = async (
      commitOid: string,
      history: string[],
      otherHistory: string[]
    ): Promise<string> => {
      let parents: string[];

      try {
        const commit = (await git.readObject({
          dir: repoDir,
          oid: commitOid
        })).object as git.CommitDescription;
        // In case of merge commit which has 2 parents, the second parent represents tip common state and should come first
        parents = _.reverse(commit.parent);
      } catch (err) {
        if (err.code !== git.E.ReadObjectFail) {
          // We shallow clone, the commit history may be incomplete,
          throw err;
        }
      }

      if (parents) {
        history.push(...parents);
        const intersect = _.intersection(history, otherHistory);
        if (intersect.length) {
          return intersect[0];
        }

        for (const parent of parents) {
          const found = await walkHistroy(parent, history, otherHistory);
          if (found) {
            return found;
          }
        }
      }

      return null;
    };

    const base =
      (await walkHistroy(targetCommitOid, targetHistory, srcHistory)) ||
      (await walkHistroy(srcCommitOid, srcHistory, targetHistory));
    console.info( // eslint-disable-line
      `Merge base for source commit ${srcCommitOid} and target commit ${targetCommitOid}: ${base}`
    );
    return base;
  }

  /**
   * 3-way diff using merge base.
   */
  private async threeWayDiff(
    repoDir: string,
    srcCommitOid: string,
    targetCommitOid: string,
    mergeBase?: string,
    srcFiles?: { [key: string]: ConfigFile },
    targetFiles?: { [key: string]: ConfigFile }
  ) {
    const toSave: ConfigFile[] = [];
    const toDelete: ConfigFile[] = [];
    const conflict: ConfigFile[][] = [];

    mergeBase = _.isUndefined(mergeBase)
      ? await this.findMergeBase(repoDir, srcCommitOid, targetCommitOid)
      : mergeBase;

    if (mergeBase === srcCommitOid) {
      // In case merge base is src commit oid, none diff to merge
      return { toSave, toDelete, conflict };
    }

    srcFiles =
      srcFiles ||
      this.flatFiles(await this.findRepoYamlFiles(repoDir, srcCommitOid));
    targetFiles =
      targetFiles ||
      this.flatFiles(await this.findRepoYamlFiles(repoDir, targetCommitOid));

    let baseFiles: { [key: string]: ConfigFile };

    if (mergeBase) {
      try {
        baseFiles =
          mergeBase === targetCommitOid
            ? targetFiles
            : this.flatFiles(await this.findRepoYamlFiles(repoDir, mergeBase));
      } catch (err) {
        if (err.code !== git.E.ReadObjectFail) {
          // We shallow clone, the commit history may be incomplete,
          throw err;
        }
      }
    }

    if (baseFiles) {
      // Changes in src branch
      const {
        onlyInLeft: srcCreated,
        onlyInRight: srcDeleted,
        modified: srcModified
      } = this.diffBranchFiles(srcFiles, baseFiles);

      // 3-way diff
      for (const createdFile of srcCreated) {
        const targetFile = targetFiles[this.fileKey(createdFile)];
        if (!targetFile) {
          toSave.push(createdFile);
        } else if (createdFile.oid !== targetFile.oid) {
          conflict.push([createdFile, targetFile]);
        }
      }

      for (const deletedFile of srcDeleted) {
        const targetFile = targetFiles[this.fileKey(deletedFile)];
        if (targetFile) {
          toDelete.push(targetFile);
        }
      }

      for (const [modifiedFile, oldFile] of srcModified) {
        const targetFile = targetFiles[this.fileKey(oldFile)];
        if (!targetFile || oldFile.oid === targetFile.oid) {
          toSave.push(modifiedFile);
        } else if (modifiedFile.oid !== targetFile.oid) {
          conflict.push([modifiedFile, targetFile]);
        }
      }
    } else {
      // No merge base found due to shallow clone, this is called "merging unrelated histories"
      // fall back to a custom strategy
      const { onlyInLeft, modified } = this.diffBranchFiles(
        srcFiles,
        targetFiles
      );
      toSave.push(...onlyInLeft);
      conflict.push(...modified);
    }

    return { toSave, toDelete, conflict };
  }

  /**
   * Get branch diff which are elegible to be merged into target branch.
   *
   * @param principal the logged in user principal
   * @param srcBranch the source branch
   * @param targetBranch the target branch
   * @returns the diff which are elegible to be merged into target branch
   * @see mergeBranch
   */
  public async branchDiff(
    principal: Principal,
    srcBranch: string,
    targetBranch: string
  ) {
    const user = principal.user;

    const repoDir = PathFinder.getRepoDir(user);

    const srcCommitOid = await this.getRemoteCommit(repoDir, srcBranch);
    const targetCommitOid = await this.getRemoteCommit(repoDir, targetBranch);

    const { toSave, toDelete, conflict } = await this.threeWayDiff(
      repoDir,
      srcCommitOid,
      targetCommitOid
    );

    const conflictFiles: ConflictFile[] = [];

    // Load file content
    await Promise.all(
      toSave.map(async srcFile => {
        const pathFinder = new PathFinder(user, srcFile, srcBranch);
        const { content: draftContent } = await this.readRepoFile(
          repoDir,
          srcCommitOid,
          pathFinder.repoFilePath
        );

        srcFile.draftContent = draftContent;
      })
    );

    await Promise.all(
      conflict.map(async ([srcFile, targetFile]) => {
        const srcPathFinder = new PathFinder(user, srcFile, srcBranch);
        const { content: draftContent } = await this.readRepoFile(
          repoDir,
          srcCommitOid,
          srcPathFinder.repoFilePath
        );

        const targetPathFinder = new PathFinder(user, targetFile, targetBranch);
        const { content: originalContent } = await this.readRepoFile(
          repoDir,
          targetCommitOid,
          targetPathFinder.repoFilePath
        );

        conflictFiles.push({
          ...targetFile,
          draftContent,
          originalContent
        });
      })
    );

    return { toSave, toDelete, conflictFiles };
  }

  /**
   * Merge source branch into target branch.
   *
   * @param principal the logged in user principal
   * @param srcBranch the source branch
   * @param targetBranch the target branch
   * @param diff the diff to be merged into target branch
   */
  public async mergeBranch(
    principal: Principal,
    srcBranch: string,
    targetBranch: string,
    diff: { toSave: ConfigFile[]; toDelete: ConfigFile[] }
  ) {
    const fs = await this.utilService.getBrowserFS();
    const user = principal.user;
    const repoDir = PathFinder.getRepoDir(user);

    const sourceCommit = await this.getRemoteCommit(repoDir, srcBranch);
    const targetCommit = await this.getRemoteCommit(repoDir, targetBranch);

    await this.doPush(
      fs,
      user,
      repoDir,
      targetBranch,
      targetCommit,
      async () => {
        await this.saveRepoFiles(fs, repoDir, diff.toSave, user);
        for (const dfile of diff.toDelete) {
          const filepath = path.join(
            percyConfig.yamlAppsFolder,
            dfile.applicationName,
            dfile.fileName
          );
          await git.remove({
            dir: repoDir,
            filepath
          });
        }
        const commitOid = await git.commit({
          dir: repoDir,
          message: "[Percy] Sync master",
          author: {
            name: user.username,
            email: user.username
          }
        });
        const commit = (await git.readObject({
          dir: repoDir,
          oid: commitOid
        })).object as git.CommitDescription;
        commit.parent.push(sourceCommit);

        const mergeCommitOid = await git.writeObject({
          dir: repoDir,
          type: "commit",
          object: commit
        });
        await this.writeHeadCommit(repoDir, targetBranch, mergeCommitOid);
        return mergeCommitOid;
      }
    );
  }

  /**
   * Sync head commit oid with remote commit oid.
   *
   * @param repoDir the repo dir
   * @param src the source remote branch
   * @param target the target branch to update its head
   * @returns the remote commit oid
   */
  private async syncHeadCommit(repoDir: string, src: string, target?: string) {
    const commitOid = await this.getRemoteCommit(repoDir, src);

    await this.writeHeadCommit(repoDir, target || src, commitOid);

    return commitOid;
  }

  /**
   * Write head reference in .git/HEAD to given branch.
   *
   * @param repoDir the repo dir
   * @param branch the branch name
   */
  private async writeHeadRef(repoDir: string, branch: string) {
    await git.writeRef({
      dir: repoDir,
      ref: "HEAD",
      value: `refs/heads/${branch}`,
      symbolic: true,
      force: true
    });
  }

  /**
   * Write head commit oid in .git/refs/heads/{branch}.
   *
   * @param repoDir the repo dir
   * @param branch the branch name
   * @param commitOid the commit oid
   */
  private async writeHeadCommit(
    repoDir: string,
    branch: string,
    commitOid: string
  ) {
    await git.writeRef({
      dir: repoDir,
      ref: `refs/heads/${branch}`,
      value: commitOid,
      force: true
    });
  }

  /**
   * Write remote commit oid in .git/refs/remotes/origin/{branch}.
   *
   * @param repoDir the repo dir
   * @param branch the branch name
   * @param commitOid the commit oid
   */
  private async writeRemoteCommit(
    repoDir: string,
    branch: string,
    commitOid: string
  ) {
    await git.writeRef({
      dir: repoDir,
      ref: `refs/remotes/origin/${branch}`,
      value: commitOid,
      force: true
    });
  }

  /**
   * Get remote commit oid of branch.
   *
   * @param repoDir the repo dir
   * @param branch the branch name
   * @returns remote commit oid of branch
   */
  private async getRemoteCommit(repoDir: string, branch: string) {
    return await git.resolveRef({
      dir: repoDir,
      ref: `refs/remotes/origin/${branch}`
    });
  }

  /**
   * refresh files for a particular repository.
   *
   * @param principal the logged in user principal
   */
  async refresh(principal: Principal) {
    const {
      user,
      repoMetadata
    } = await this.maintenanceService.checkSessionTimeout(principal);

    const repoDir = PathFinder.getRepoDir(user);
    const lastCommit = await this.getRemoteCommit(repoDir, user.branchName);

    const { masterChanged, currentBranchDeleted } = await this.fetchAllBranches(
      user,
      repoDir,
      repoMetadata
    );

    if (currentBranchDeleted) {
      const err = new Error(
        `Branch ${repoMetadata.branchName} has been deleted in remote repo`
      );
      err["currentBranchDeleted"] = true;
      throw err;
    }

    const pulledCommit = await this.syncHeadCommit(repoDir, user.branchName);

    return {
      pulledCommit,
      branchChanged: lastCommit !== pulledCommit,
      masterChanged
    };
  }

  /**
   * get the app environments and percy config
   *
   * @param principal the logged in user principal
   * @param applicationName the app name
   * @returns app environments and percy config
   */
  async getEnvironments(principal: Principal, applicationName: string) {
    const file = {
      fileName: percyConfig.environmentsFile,
      applicationName,
      fileType: FileTypes.YAML
    };

    // Load environments.yaml
    const getEnvs = async () => {
      let envFile: ConfigFile;
      try {
        envFile = await this.getFileContent(principal, file);
      } catch (err) {
        if (err instanceof HttpErrors.HttpError && err.statusCode === 404) {
          console.warn(`${applicationName} environments file does not exist`);
          return [];
        } else {
          throw err;
        }
      }

      const config = envFile.draftConfig || envFile.originalConfig;
      return _.map(
        _.get(config.environments, "children", [] as TreeNode[]),
        child => child.key
      );
    };

    const result = await Promise.all([
      getEnvs(),
      this.loadAppPercyConfig(principal.user, applicationName)
    ]);

    return { environments: result[0], appPercyConfig: result[1] };
  }

  /**
   * Loads application's specific percy config.
   *
   * @param user the logged in user
   * @param applicationName the application name
   */
  private async loadAppPercyConfig(user: User, applicationName: string) {
    const fs = await this.utilService.getBrowserFS();

    const appPercyFile: ConfigFile = {
      fileName: ".percyrc",
      applicationName
    };

    const appsPercyFile: ConfigFile = {
      fileName: ".percyrc",
      applicationName: percyConfig.yamlAppsFolder
    };

    const pathFinderApp = new PathFinder(user, appPercyFile, user.branchName);
    const pathFinderApps = new PathFinder(user, appsPercyFile, user.branchName);

    const commitOid = await this.getRemoteCommit(pathFinderApp.repoDir, user.branchName);

    // Load .percyrc from the repo for the app
    const readRepoPercyrc = async (filepath: string) => {
      const { content } = await this.readRepoFile(pathFinderApp.repoDir, commitOid, filepath);
      return content ? JSON.parse(content) : {};
    };

    // Load .percyrc from draft for the app
    const readDraftPercyrc = async (filepath: string) => {
      const fileExists = await fs.pathExists(filepath);
      const content = fileExists ? await fs.readFile(filepath) : null;
      return content ? JSON.parse(content.toString()) : {};
    };

    const result = await Promise.all([
      await fs.pathExists(pathFinderApps.draftFullFilePath)
        ? readDraftPercyrc(pathFinderApps.draftFullFilePath)
        : readRepoPercyrc(pathFinderApps.repoFilePath),
      await fs.pathExists(pathFinderApp.draftFullFilePath)
        ? readDraftPercyrc(pathFinderApp.draftFullFilePath)
        : readRepoPercyrc(pathFinderApp.repoFilePath)
    ]);

    // Merge percyrcs
    return _.assign({}, ...result);
  }

  /**
   * Read from git object directly to find yaml files in repo.
   * This method will not read file content, it just traverse the object tree.
   */
  private async findRepoYamlFiles(
    dir: string,
    commitOid: string,
    result: { [key: string]: ConfigFile[] } = {},
    depth: number = 0,
    treeOid?: string,
    app?: string
  ) {
    result[""] = result[""] || [];
    result[percyConfig.yamlAppsFolder] = result[percyConfig.yamlAppsFolder] || [];

    if (depth === 0) {
      const { object: commit } = await git.readObject({ dir, oid: commitOid });
      treeOid = (commit as CommitDescription).tree;
    }

    const { object: tree } = await git.readObject({ dir, oid: treeOid });

    for (const entry of (tree as TreeDescription).entries) {
      if (depth === 0) {
        if (
          entry.path === percyConfig.yamlAppsFolder &&
          entry.type === "tree"
        ) {
          await this.findRepoYamlFiles(dir, commitOid, result, 1, entry.oid);
        } else if (entry.type === "blob") {
          const ext = path.extname(entry.path).toLowerCase();
          if (ext === ".md" || entry.path === ".percyrc") {
            result[""].push(this.getFileConfig(entry, ""));
          }
        }
      } else if (depth === 1) {
        if (entry.type === "tree") {
          result[entry.path] = [];
          await this.findRepoYamlFiles(
            dir,
            commitOid,
            result,
            2,
            entry.oid,
            entry.path
          );
        } else if (entry.type === "blob") {
          const ext = path.extname(entry.path).toLowerCase();
          if (ext === ".md" || entry.path === ".percyrc") {
            result[percyConfig.yamlAppsFolder].push(this.getFileConfig(entry, percyConfig.yamlAppsFolder));
          }
        }
      } else {
        if (entry.type === "blob") {
          const ext = path.extname(entry.path).toLowerCase();
          if (ext === ".yaml" || ext === ".yml" || ext === ".md" || entry.path === ".percyrc") {
            result[app].push(this.getFileConfig(entry, app));
          }
        }
      }
    }
    return result;
  }


  /**
   * @param  entry, file tree entry
   * @param  appName application name which the file belongs to
   */
  getFileConfig(entry: any, appName: string): ConfigFile {
    const ext = path.extname(entry.path).toLowerCase();
    const fileType = entry.path === ".percyrc" ? FileTypes.PERCYRC : (ext === ".md" ? FileTypes.MD : FileTypes.YAML);

    return {
      applicationName: appName,
      fileName: entry.path,
      oid: entry.oid,
      fileType
    };
  }

  /**
   * get files for a particular repository.
   *
   * Note: this method never loads file content for performance reason
   *
   * @param principal the logged in user principal
   */
  async getFiles(principal: Principal) {
    const fs = await this.utilService.getBrowserFS();

    const { user } = await this.maintenanceService.checkSessionTimeout(
      principal
    );
    const repoDir = PathFinder.getRepoDir(user);

    const branch = user.branchName;
    const branchCommitOid = await this.getRemoteCommit(repoDir, branch);
    const [draft, branchFiles] = await Promise.all([
      this.findDraftFiles(fs, user.repoFolder, branch),
      this.findRepoYamlFiles(repoDir, branchCommitOid)
    ]);

    _.forEach(_.keys(branchFiles), app => {
      if (draft.applications.indexOf(app) === -1 && app !== "" && app !== percyConfig.yamlAppsFolder) {
        draft.applications.push(app);
      }
      _.forEach(branchFiles[app], repoFile => {
        const ext = path.extname(repoFile.fileName).toLowerCase();
        if (ext === ".yaml" || ext === ".yml" || ext === ".md" || repoFile.fileName === ".percyrc") {
          const draftFile = _.find(
            draft.files,
            f =>
              f.applicationName === repoFile.applicationName &&
              f.fileName === repoFile.fileName
          );
          if (!draftFile) {
            repoFile.modified = false;
            draft.files.push(repoFile);
          } else {
            _.assign(draftFile, repoFile);
          }
        }
      });
    });

    const appConfigs: { [app: string]: any } = {};
    await Promise.all(
      draft.applications.map(async app => {
        const appConfig = await this.loadAppPercyConfig(user, app);
        const defaultAppConfig = _.pick(percyConfig, [
          "variablePrefix",
          "variableSuffix",
          "variableNamePrefix",
          "envVariableName"
        ]);
        appConfigs[app] = _.assign(defaultAppConfig, appConfig);
      })
    );

    let canPullRequest = false;
    let canSyncMaster = false;
    if (branch !== "master") {
      const masterCommitOid = await this.getRemoteCommit(repoDir, "master");
      const masterFiles = await this.findRepoYamlFiles(
        repoDir,
        masterCommitOid
      );

      const flatMasterFiles = this.flatFiles(masterFiles);
      const flatBranchFiles = this.flatFiles(branchFiles);

      const mergeBase = await this.findMergeBase(
        repoDir,
        masterCommitOid,
        branchCommitOid
      );

      const { toSave, toDelete, conflict } = await this.threeWayDiff(
        repoDir,
        branchCommitOid,
        masterCommitOid,
        mergeBase,
        flatBranchFiles,
        flatMasterFiles
      );

      canPullRequest =
        !!toSave.length || !!toDelete.length || !!conflict.length;

      const { toSave: s, toDelete: d, conflict: c } = await this.threeWayDiff(
        repoDir,
        masterCommitOid,
        branchCommitOid,
        mergeBase,
        flatMasterFiles,
        flatBranchFiles
      );

      canSyncMaster = !!s.length || !!d.length || !!c.length;
    }

    return { ...draft, appConfigs, canPullRequest, canSyncMaster };
  }

  /**
   * Find draft files.
   *
   * Note: this method never loads file content for performance reason
   *
   * @param fs the FS
   * @param repoFolder the repo folder name
   * @param branchName the branch name
   */
  private async findDraftFiles(fs: FS, repoFolder: string, branchName: string) {
    const files: ConfigFile[] = [];
    const applications: string[] = [];
    const repoPath = path.resolve(percyConfig.draftFolder, repoFolder);
    const repoRootPath = path.resolve(
      repoPath,
      branchName
    );
    const appsPath = path.resolve(
      repoPath,
      branchName,
      percyConfig.yamlAppsFolder
    );

    // read root files
    if (await fs.pathExists(repoRootPath)) {
      const rootFiles = await fs.readdir(repoRootPath);
      await Promise.all(
        rootFiles.map(async fileName => {
          const stat = await fs.stat(path.resolve(repoRootPath, fileName));
          if (!stat.isFile()) {
            return;
          }
          const ext = path.extname(fileName).toLowerCase();
          if (ext === ".md" || fileName === ".percyrc") {
            const file: ConfigFile = {
              applicationName: "",
              fileType: fileName === ".percyrc" ? FileTypes.PERCYRC : FileTypes.MD,
              fileName,
              size: stat.size,
              modified: true // For draft files, we simply assume they're modified
            };
            files.push(file);
          }
        })
      );
    }

    if (await fs.pathExists(appsPath)) {
      const apps = await fs.readdir(appsPath);

      await Promise.all(
        apps.map(async applicationName => {
          const appPath = path.resolve(appsPath, applicationName);
          const appsStat = await fs.stat(appPath);

          // for files in the apps folder
          if (!appsStat.isDirectory()) {
            const ext = path.extname(applicationName).toLowerCase();
            if (ext === ".md" || applicationName === ".percyrc") {
              const file: ConfigFile = {
                applicationName: percyConfig.yamlAppsFolder,
                fileType: applicationName === ".percyrc" ? FileTypes.PERCYRC : FileTypes.MD,
                fileName: applicationName,
                size: appsStat.size,
                modified: true // For draft files, we simply assume they're modified
              };
              files.push(file);
            }
            return;
          }

          applications.push(applicationName);
          const appFiles = await fs.readdir(appPath);
          await Promise.all(
            appFiles.map(async fileName => {
              const stat = await fs.stat(path.resolve(appPath, fileName));
              if (!stat.isFile()) {
                return;
              }
              const ext = path.extname(fileName).toLowerCase();
              if (ext === ".yaml" || ext === ".yml" || ext === ".md" || fileName === ".percyrc") {
                const file: ConfigFile = {
                  applicationName,
                  fileType: fileName === ".percyrc" ? FileTypes.PERCYRC : (ext === ".md" ? FileTypes.MD : FileTypes.YAML),
                  fileName,
                  size: stat.size,
                  modified: true // For draft files, we simply assume they're modified
                };
                files.push(file);
              }
            })
          );
        })
      );
    }

    return { files: [...files], applications };
  }

  /**
   * get file content of provided file path
   *
   * @param user the logged in user
   * @param file the file to get its draft and original content
   */
  async getFileContent(
    principal: Principal,
    file: ConfigFile
  ): Promise<ConfigFile> {
    const isYamlFile = file.fileType === FileTypes.YAML;

    const fs = await this.utilService.getBrowserFS();
    const {
      user,
      repoMetadata
    } = await this.maintenanceService.checkSessionTimeout(principal);

    const repoDir = PathFinder.getRepoDir(user);
    const branchName = user.branchName;
    const pathFinder = new PathFinder(user, file, branchName);

    const commitOid = await this.getRemoteCommit(repoDir, branchName);
    const { content, oid } = await this.readRepoFile(
      repoDir,
      commitOid,
      pathFinder.repoFilePath
    );

    if (content) {
      file.oid = oid;
      if (isYamlFile) {
        file.originalConfig = this.utilService.parseYamlConfig(content);
      } else {
        file.originalContent = content;
      }
    }

    if (await fs.pathExists(pathFinder.draftFullFilePath)) {
      const draftContent = await fs.readFile(pathFinder.draftFullFilePath);
      if (isYamlFile) {
        file.draftConfig = this.utilService.parseYamlConfig(
          draftContent.toString()
        );
      } else {
        file.draftContent = draftContent.toString();
      }
    }

    if (
        (isYamlFile && !file.originalConfig && !file.draftConfig) ||
        (!isYamlFile && !file.originalContent && !file.draftContent)
    ) {
      throw new HttpErrors.NotFound(
        `File '${file.applicationName}/${file.fileName}' does not exist`
      );
    }

    let removeDraftFile = false;

    if (isYamlFile) {
      file.modified = file.draftConfig
        ? !_.isEqual(file.originalConfig, file.draftConfig)
        : false;

      removeDraftFile = file.draftConfig && !file.modified;
    } else {
      file.modified = file.draftContent
        ? !_.isEqual(file.originalContent, file.draftContent)
        : false;

      removeDraftFile = file.draftContent && !file.modified;
    }

    if (removeDraftFile) {
      // Remove draft file
      await fs.remove(pathFinder.draftFullFilePath);
      // Clear commit base SHA
      await this.saveCommitBaseSHA(
        fs,
        repoMetadata,
        { [pathFinder.repoFilePath]: "" },
        branchName
      );

      if (isYamlFile) {
        file.draftConfig = undefined;
      } else {
        file.draftContent = undefined;
      }
    }

    return file;
  }

  /**
   * Save commit base SHA (which is file's oid).
   */
  private async saveCommitBaseSHA(
    fs: FS,
    repoMetadata: RepoMetadata,
    newBaseSHAs: { [filepath: string]: string },
    branch: string
  ) {
    let anyChange = false;

    let commitBaseSHA = repoMetadata.commitBaseSHA[branch];
    if (!commitBaseSHA) {
      commitBaseSHA = repoMetadata.commitBaseSHA[branch] = {};
      anyChange = true;
    }

    _.each(newBaseSHAs, (newBaseSHA, filepath) => {
      if (!newBaseSHA && commitBaseSHA[filepath]) {
        delete commitBaseSHA[filepath];
        anyChange = true;
      } else if (newBaseSHA && commitBaseSHA[filepath] !== newBaseSHA) {
        commitBaseSHA[filepath] = newBaseSHA;
        anyChange = true;
      }
    });

    if (anyChange) {
      // Only save when there is change
      const metadataFile = this.utilService.getMetadataPath(
        repoMetadata.repoFolder
      );
      await fs.outputJson(metadataFile, repoMetadata);
    }
  }

  /**
   * Save draft file.
   *
   * Note this method is also reponsible to clean draft data in case file is not modified.
   *
   * @param user the logged in user
   * @param file the draft file to save
   */
  async saveDraft(principal: Principal, file: ConfigFile) {
    const fs = await this.utilService.getBrowserFS();
    const {
      user,
      repoMetadata
    } = await this.maintenanceService.checkSessionTimeout(principal);

    const branchName = user.branchName;
    const pathFinder = new PathFinder(user, file, branchName);

    if (!file.modified) {
      // Not modified, don't need draft file
      const draftFileExists = await fs.pathExists(pathFinder.draftFullFilePath);
      if (draftFileExists) {
        console.warn(
          `Draft file '${file.applicationName}/${
            file.fileName
          }' found to have same content as repo, will be deleted`
        );
        await fs.remove(pathFinder.draftFullFilePath);
      }
      // Clear commit base SHA
      await this.saveCommitBaseSHA(
        fs,
        repoMetadata,
        { [pathFinder.repoFilePath]: "" },
        branchName
      );
    } else {
      // Save draft
      await fs.ensureDir(pathFinder.draftAppDir);

      // Save the draft config
      await fs.writeFile(
        pathFinder.draftFullFilePath,
        file.fileType === FileTypes.YAML
          ? this.utilService.convertTreeToYaml(file.draftConfig)
          : file.draftContent
      );

      if (
        (!repoMetadata.commitBaseSHA[branchName] ||
          !repoMetadata.commitBaseSHA[branchName][pathFinder.repoFilePath]) &&
        file.oid
      ) {
        // Save draft file's commit base SHA if not saved yet
        await this.saveCommitBaseSHA(
          fs,
          repoMetadata,
          { [pathFinder.repoFilePath]: file.oid },
          branchName
        );
      }
    }

    return file;
  }

  /**
   * Read file content from repo.
   *
   * @param repoDir the repo dir
   * @param commitOid the commit oid
   * @param filepath the file path
   * @returns file content and file oid; null value will be returned if file does not exist
   */
  private async readRepoFile(
    repoDir: string,
    commitOid: string,
    filepath: string
  ) {
    try {
      const { object, oid, type } = await git.readObject({
        dir: repoDir,
        oid: commitOid,
        filepath,
        format: "parsed",
        encoding: "utf8"
      });
      return { content: type === "blob" ? object.toString() : null, oid };
    } catch (err) {
      if (err.code === git.E.TreeOrBlobNotFoundError) {
        return { content: null, oid: null };
      }
      throw err;
    }
  }

  /**
   * Check if file exists in repo.
   *
   * @param repoDir the repo dir
   * @param commitOid the commit oid
   * @param filepath the file path
   * @returns true if repo file exists, false otherwise
   */
  private async isRepoFileExists(
    repoDir: string,
    commitOid: string,
    filepath: string
  ) {
    try {
      await git.readObject({
        dir: repoDir,
        oid: commitOid,
        filepath,
        format: "deflated"
      });
      return true;
    } catch (err) {
      if (err.code === git.E.TreeOrBlobNotFoundError) {
        return false;
      }
      throw err;
    }
  }

  /**
   * deletes the file within the given location from the repository
   *
   * @param auth the logged in user
   * @param file the file to delete
   */
  async deleteFile(principal: Principal, file: ConfigFile) {
    const fs = await this.utilService.getBrowserFS();
    const {
      user,
      repoMetadata
    } = await this.maintenanceService.checkSessionTimeout(principal);

    const repoDir = PathFinder.getRepoDir(user);
    const branchName = user.branchName;
    const pathFinder = new PathFinder(user, file, branchName);

    let gitPulled = false;

    const commitOid = await this.getRemoteCommit(repoDir, branchName);
    if (
      await this.isRepoFileExists(
        pathFinder.repoDir,
        commitOid,
        pathFinder.repoFilePath
      )
    ) {
      const { pulledCommit, changed } = await this.fetchBranch(
        user,
        repoDir,
        branchName,
        true
      );
      gitPulled = changed;

      // Check whether exists again after pull
      if (
        await this.isRepoFileExists(
          pathFinder.repoDir,
          pulledCommit,
          pathFinder.repoFilePath
        )
      ) {
        // Do push
        await this.doPush(
          fs,
          user,
          repoDir,
          branchName,
          pulledCommit,
          async () => {
            await git.remove({
              dir: repoDir,
              filepath: pathFinder.repoFilePath
            });
            return await git.commit({
              dir: repoDir,
              message: "[Percy] Delete",
              author: {
                name: user.username,
                email: user.username
              }
            });
          }
        );
      }
    }

    // Also delete draft file if any
    if (await fs.pathExists(pathFinder.draftFullFilePath)) {
      await fs.remove(pathFinder.draftFullFilePath);
    }
    // Also delete commit base SHA if any
    await this.saveCommitBaseSHA(
      fs,
      repoMetadata,
      { [pathFinder.repoFilePath]: "" },
      branchName
    );

    return gitPulled;
  }

  /**
   * Do push. Will rollback to last commit if any error.
   */
  private async doPush(
    fs: FS,
    user: User,
    dir: string,
    branch: string,
    lastCommit: string,
    commitAction: () => Promise<string>,
    forcePush = false
  ) {
    await this.resetIndexes(fs, dir, branch);

    let commitOid: string;
    try {
      commitOid = await commitAction();

      await git.push({
        dir,
        ref: branch,
        username: user.username,
        password: user.password,
        corsProxy: percyConfig.corsProxy,
        force: forcePush
      });
    } catch (err) {
      // Rollback to last commit
      await this.writeHeadCommit(dir, branch, lastCommit);
      await this.resetIndexes(fs, dir, branch);
      throw err;
    }

    // Weird, isogit does't update the remote commit oid after push
    await this.writeRemoteCommit(dir, branch, commitOid);
    await this.writeHeadCommit(dir, branch, commitOid);
    await this.resetIndexes(fs, dir, branch);
  }

  /**
   * Ensure Index status identical to HEAD status.
   */
  private async resetIndexes(fs: FS, dir: string, branch: string) {
    // Remove any workdir files
    const workfiles = await fs.readdir(dir);
    for (const file of workfiles) {
      if (file !== ".git") {
        await fs.remove(path.resolve(dir, file));
      }
    }

    await fs.remove(path.resolve(dir, ".git", "index"));

    // Ensure Index status identical to HEAD status
    const files = await git.listFiles({ dir, ref: branch });
    for (const filepath of files) {
      await git.resetIndex({ dir, filepath, ref: branch });
    }
  }

  private async saveRepoFiles(fs: FS, repoDir: string, toSave: ConfigFile[], user: User) {
    // Create folders at first
    const folders = [];
    _.each(toSave, file => {
      const pathFinder = new PathFinder(user, file, user.branchName);
      const folderPath = pathFinder.repoAppDir;

      if (!folders.includes(folderPath)) {
        folders.push(folderPath);
      }
    });
    for (const folder of folders) {
      await fs.ensureDir(folder);
    }

    await Promise.all(
      toSave.map(async file => {
        const pathFinder = new PathFinder(user, file, user.branchName);
        const fullFilePath = pathFinder.fullFilePath;

        // Convert json to yaml
        await fs.writeFile(fullFilePath, file.draftContent);

        file.size = (await fs.stat(fullFilePath)).size;
      })
    );

    for (const file of toSave) {
      const pathFinder = new PathFinder(user, file, user.branchName);
      // Add file to index
      await git.add({
        dir: repoDir,
        filepath: pathFinder.repoFilePath
      });
    }
  }

  /**
   * Commits the files
   *
   * @param auth the logged in user
   * @param configFiles the config files to commit
   * @param message the commit message
   * @param forcePush the flag indicates whether to force push
   */
  async commitFiles(
    principal: Principal,
    configFiles: ConfigFile[],
    message: string,
    forcePush = false
  ) {
    const fs = await this.utilService.getBrowserFS();
    const {
      user,
      repoMetadata
    } = await this.maintenanceService.checkSessionTimeout(principal);

    const repoDir = PathFinder.getRepoDir(user);
    const branchName = user.branchName;

    const { pulledCommit } = await this.fetchBranch(
      user,
      repoDir,
      branchName,
      true
    );

    let newRepoFiles: ConfigFile[];
    if (!forcePush) {
      newRepoFiles = _.reduce(
        await this.findRepoYamlFiles(repoDir, pulledCommit),
        (r, v) => r.concat(v),
        []
      );
    }

    // Do optimistic check
    const conflictFiles: ConflictFile[] = [];
    let commitBaseSHA = _.cloneDeep(
      repoMetadata.commitBaseSHA[branchName] || {}
    );
    await Promise.all(
      configFiles.map(async file => {
        const pathFinder = new PathFinder(user, file, branchName);

        if (file.fileType === FileTypes.YAML) {
          if (!file.draftConfig) {
            file.draftContent = (await fs.readFile(
              pathFinder.draftFullFilePath
            )).toString();
            file.draftConfig = this.utilService.parseYamlConfig(
              file.draftContent
            );
          } else {
            file.draftContent = this.utilService.convertTreeToYaml(
              file.draftConfig,
              false
            );
          }
        } else {
          if (!file.draftContent) {
            file.draftContent = (await fs.readFile(
              pathFinder.draftFullFilePath
            )).toString();
          }
        }

        if (!forcePush) {
          const oldOid = commitBaseSHA[pathFinder.repoFilePath] || file.oid;
          if (oldOid) {
            // When commit added file, there is no oldOid
            // When commit edited file, assign it as base SHA
            commitBaseSHA[pathFinder.repoFilePath] = oldOid;
          }

          const newFile = _.find(
            newRepoFiles,
            f =>
              f.applicationName === file.applicationName &&
              f.fileName === file.fileName
          );
          const newOid = newFile ? newFile.oid : undefined;

          if ((!oldOid && newOid) || (oldOid && newOid && oldOid !== newOid)) {
            // Should conflict if found to be deleted?
            const { content: originalContent } = await this.readRepoFile(
              repoDir,
              pulledCommit,
              pathFinder.repoFilePath
            );

            const originalConfig = file.fileType === FileTypes.YAML
              ? this.utilService.parseYamlConfig(originalContent)
              : null;

            conflictFiles.push({
              ...file,
              originalConfig,
              originalContent
            });
          }
        }
      })
    );

    if (conflictFiles.length) {
      // Conflict happens, save the conflicted commit base SHA, then user will have 3 options:
      // 1. Use repo file to discard local draft changes (commit base SHA will be cleared)
      // 2. Force to push draft file (commit base SHA will be cleared upon successful push)
      // 3. None of the above, and try to commit again, conflict will happen again
      await this.saveCommitBaseSHA(fs, repoMetadata, commitBaseSHA, branchName);

      const names = conflictFiles
        .map(file => `• ${file.applicationName}/${file.fileName}`)
        .join("\n");
      const error = new HttpErrors.Conflict(
        `The following file(s) are already changed in the repository:\n${names}`
      );
      error.data = conflictFiles;
      throw error;
    }

    await this.doPush(
      fs,
      user,
      repoDir,
      branchName,
      pulledCommit,
      async () => {
        await this.saveRepoFiles(fs, repoDir, configFiles, user);
        return await git.commit({
          dir: repoDir,
          message,
          author: {
            name: user.username,
            email: user.username
          }
        });
      },
      forcePush
    );

    // Delete draft files
    commitBaseSHA = {};
    await Promise.all(
      configFiles.map(async file => {
        const pathFinder = new PathFinder(user, file, branchName);
        if (await fs.pathExists(pathFinder.draftFullFilePath)) {
          await fs.remove(pathFinder.draftFullFilePath);
        }
        file.modified = false;
        file.originalConfig = file.draftConfig;
        file.draftConfig = undefined;
        file.originalContent = file.draftContent;
        file.draftContent = undefined;
        commitBaseSHA[pathFinder.repoFilePath] = "";
      })
    );

    // Clear commit base SHAs
    await this.saveCommitBaseSHA(fs, repoMetadata, commitBaseSHA, branchName);

    // Important Note:
    // This method does NOT return newest oid of files, the app will
    // redirect to dashboard and reload files, thus get the newest oid.
    // In future if the app behavior is changed (e.g no redirect to dashboard),
    // then this method need return the newest oid
    return configFiles;
  }

  /**
   * Resolve conflicts
   *
   * @param auth the logged in user
   * @param configFiles the config files to commit
   * @param message the commit message
   */
  async resovelConflicts(
    principal: Principal,
    configFiles: ConfigFile[],
    message: string
  ) {
    const modified: ConfigFile[] = [];
    let result: ConfigFile[] = [];

    await Promise.all(
      configFiles.map(async file => {
        file.modified = file.fileType === FileTypes.YAML
          ? !_.isEqual(file.draftConfig, file.originalConfig)
          : !_.isEqual(file.draftContent, file.originalContent);

        if (file.modified) {
          modified.push(file);
        } else {
          await this.saveDraft(principal, file); // This will remove draft file and clear commit base SHA
          result.push(file);
        }
      })
    );

    if (modified.length) {
      const committed = await this.commitFiles(
        principal,
        modified,
        message,
        true
      );
      result = _.concat(committed, result);
    }

    return result;
  }
}
