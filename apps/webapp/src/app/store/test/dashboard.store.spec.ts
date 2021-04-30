/**
========================================================================
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

import { StoreTestComponent, SETUP, TestContext } from "test/test-helper";

import { FileManagementService } from "services/file-management.service";
import { ConfigFile, Configuration } from "models/config-file";
import * as reducer from "../reducers/dashboard.reducer";
import { SelectApp, CollapseApps, ToggleApp, TableSort } from "../actions/dashboard.actions";
import * as BackendActions from "../actions/backend.actions";

const file1: ConfigFile = {
  fileName: "test1.yaml",
  applicationName: "app1",
  modified: true,
  oid: "111111",
  draftConfig: new Configuration(),
  originalConfig: new Configuration(),
};

describe("Dashboard store action/effect/reducer", () => {
  let ctx: TestContext<StoreTestComponent>;

  const setup = SETUP(StoreTestComponent);

  beforeEach(() => {
    ctx = setup();
    const fileService = ctx.resolve(FileManagementService);
    spyOn(fileService, "getFiles").and.returnValue(Promise.resolve({ files: [file1], applications: ["app1"] }));
    spyOn(fileService, "commitFiles").and.returnValue(Promise.resolve([file1]));
    spyOn(fileService, "saveDraft").and.returnValue(Promise.resolve(file1));
    spyOn(fileService, "deleteFile").and.returnValue(Promise.resolve(false));
  });

  it("SelectApp action should be successful", async () => {
    ctx.store.dispatch(new SelectApp("app1"));
    expect(reducer.getSelectedApp(ctx.dashboarState())).toEqual("app1");
  });

  it("CollapseApps action should be successful", async () => {
    ctx.store.dispatch(new CollapseApps(["app1", "app2"]));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual(["app1", "app2"]);
  });

  it("ToggleApp action should be successful", async () => {
    ctx.store.dispatch(new CollapseApps(["app1", "app2"]));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual(["app1", "app2"]);

    ctx.store.dispatch(new ToggleApp("app1"));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual(["app2"]);

    ctx.store.dispatch(new ToggleApp("app1"));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual(["app2", "app1"]);

    ctx.store.dispatch(new ToggleApp("app2"));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual(["app1"]);

    ctx.store.dispatch(new ToggleApp("app1"));
    expect(reducer.getCollapsedApps(ctx.dashboarState())).toEqual([]);
  });

  it("TableSort action should be successful", async () => {
    ctx.store.dispatch(new TableSort({ applicationName: "desc" }));
    expect(reducer.getTableSort(ctx.dashboarState())).toEqual({
      applicationName: "desc",
      fileName: "asc",
    });

    ctx.store.dispatch(new TableSort({ fileName: "desc" }));
    expect(reducer.getTableSort(ctx.dashboarState())).toEqual({
      applicationName: "desc",
      fileName: "desc",
    });

    ctx.store.dispatch(new TableSort({ applicationName: "asc" }));
    expect(reducer.getTableSort(ctx.dashboarState())).toEqual({
      applicationName: "asc",
      fileName: "desc",
    });

    ctx.store.dispatch(new TableSort({ fileName: "asc" }));
    expect(reducer.getTableSort(ctx.dashboarState())).toEqual({
      applicationName: "asc",
      fileName: "asc",
    });
  });

  it("CommitChangesSuccess action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.CommitChanges({ files: [], fromEditor: false, message: "" }));
    expect(reducer.isCommittingFile(ctx.dashboarState())).toEqual(true);
    ctx.store.dispatch(new BackendActions.CommitChangesSuccess({ files: [], fromEditor: false }));
    expect(reducer.isCommittingFile(ctx.dashboarState())).toEqual(false);
  });

  it("CommitChangesFailure action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.CommitChanges({ files: [], fromEditor: false, message: "" }));
    expect(reducer.isCommittingFile(ctx.dashboarState())).toEqual(true);
    ctx.store.dispatch(new BackendActions.CommitChangesFailure(
      { error: new Error("mock error"), files: [], fromEditor: false, commitMessage: "" }));
    expect(reducer.isCommittingFile(ctx.dashboarState())).toEqual(false);
  });

  it("DeleteFileSuccess action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.DeleteFile(file1));
    expect(reducer.isDeletingFile(ctx.dashboarState())).toEqual(true);
    ctx.store.dispatch(new BackendActions.DeleteFileSuccess(file1));
    expect(reducer.isDeletingFile(ctx.dashboarState())).toEqual(false);
  });

  it("DeleteFileFailure action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.DeleteFile(file1));
    expect(reducer.isDeletingFile(ctx.dashboarState())).toEqual(true);
    ctx.store.dispatch(new BackendActions.DeleteFileFailure(new Error("mock error")));
    expect(reducer.isDeletingFile(ctx.dashboarState())).toEqual(false);
  });

});
