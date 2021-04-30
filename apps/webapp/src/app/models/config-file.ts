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

import { TreeNode, PROPERTY_VALUE_TYPES } from "./tree-node";

/**
 * Represents yaml configuration. It contains a 'default' tree and a 'environments' tree.
 */
export class Configuration extends TreeNode {
  default: TreeNode;
  environments: TreeNode;

  /**
   * Create configuration from tree node.
   *
   * @param root the root tree node
   * @returns new configuration
   */
  static fromTreeNode(root?: TreeNode) {
    return new Configuration(
      root ? root.findChild(["default"]) : null,
      root ? root.findChild(["environments"]) : null
    );
  }

  /**
   * Constructor with 'default' tree and 'environments' tree
   *
   * @param _default the 'default' tree
   * @param _environments the 'environments' tree
   */
  constructor(_default?: TreeNode, _environments?: TreeNode) {
    super("");

    this.default = _default;
    this.environments = _environments;

    if (
      !this.default ||
      this.default.valueType !== PROPERTY_VALUE_TYPES.OBJECT
    ) {
      this.default = new TreeNode("default");
    }

    if (
      !this.environments ||
      this.environments.valueType !== PROPERTY_VALUE_TYPES.OBJECT
    ) {
      this.environments = new TreeNode("environments");
    }

    // Make them as root
    // (In yaml file, they are not root; But in editor view, they are displayed in separate tree, and thus is root)
    this.default.parent = undefined;
    this.environments.parent = undefined;

    this.children = [];
    this.children.push(this.default);
    this.children.push(this.environments);
  }
}

export enum FileTypes {
  YAML = "yaml",
  YML = "yml",
  PERCYRC = "percyrc",
  MD = "md"
}

export interface ConfigFile {
  fileName: string;
  applicationName: string; // use "" for root folder, percyConfig.yamlAppsFolder for apps folder and application name otherwise
  fileType?: FileTypes; // default is yaml filetype
  size?: number;
  modified?: boolean; // Means this is a modified file compared to repo, able to commit
  draftConfig?: Configuration;
  originalConfig?: Configuration;
  draftContent?: string;
  originalContent?: string;
  oid?: string; // File SHA oid
}

export interface ConflictFile extends ConfigFile {
  resolveStrategy?: string;
}

export interface VariableConfig {
  cascadedValue: string;
  hasError?: boolean;
  referenceNode?: TreeNode;
}

export interface EnvsVariablesConfig {
  [env: string]: {
    [variable: string]: VariableConfig;
  };
}
