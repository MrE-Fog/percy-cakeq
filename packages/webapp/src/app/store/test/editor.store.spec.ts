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

import { ConfigFile, Configuration } from "models/config-file";
import * as BackendActions from "../actions/backend.actions";
import { FileManagementService } from "services/file-management.service";
import { AlertDialogComponent } from "components/alert-dialog/alert-dialog.component";

import { appPercyConfig } from "config";
import { StoreTestComponent, Setup, TestContext, assertDialogOpened } from "test/test-helper";
import { TreeNode } from "models/tree-node";
import { PageLoad, ConfigurationChange } from "../actions/editor.actions";
import * as reducer from "../reducers/editor.reducer";
  fileName: "test1.yaml",
  applicationName: "app1",
  oid: "111111",
  fileName: "test1.yaml",
  applicationName: "app1",
  oid: "222222",
describe("Editor store action/effect/reducer", () => {
    spyOn(fileService, "getFiles").and.returnValue({ files: [file1], applications: ["app1"] });
    spyOn(fileService, "commitFiles").and.returnValue([file1]);
    spyOn(fileService, "saveDraft").and.returnValue(file1);
    spyOn(fileService, "deleteFile").and.returnValue(false);
  it("PageLoad action should be successful for add new file mode", async () => {
    const spy = spyOn(fileService, "getEnvironments");
    spy.and.returnValue({ environments: ["dev", "prod"], appPercyConfig: { key: "value" } });
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: false }));
      applicationName: "app1",
    expect(appPercyConfig).toEqual({ key: "value" });
    expect(reducer.getEnvironments(ctx.editorState())).toEqual(["dev", "prod"]);
  it("PageLoad action should be successful for edit file mode", async () => {
    const spy = spyOn(fileService, "getEnvironments");
    spy.and.returnValue({ environments: ["dev", "prod"], appPercyConfig: { key1: "value1" } });
      fileName: "test.yaml", applicationName: "app1", originalConfig: new Configuration()
    spyOn(fileService, "getFileContent").and.returnValue(file);
    ctx.store.dispatch(new PageLoad({ fileName: "test.yaml", applicationName: "app1", editMode: true }));
    expect(reducer.getEnvironments(ctx.editorState())).toEqual(["dev", "prod"]);
    expect(appPercyConfig).toEqual({ key1: "value1" });
  it("PageLoad action should be successful for edit file mode, file content already loaded in state", async () => {
      fileName: "test.yaml", applicationName: "app1", originalConfig: new Configuration()
    ctx.store.next(new BackendActions.LoadFilesSuccess({ files: [file], applications: ["app1"], appConfigs: {} }));
    const spy = spyOn(fileService, "getEnvironments");
    spy.and.returnValue({ environments: ["dev", "prod"], appPercyConfig: { key1: "value1" } });
    const getFileContentSyp = spyOn(fileService, "getFileContent");
    ctx.store.dispatch(new PageLoad({ fileName: "test.yaml", applicationName: "app1", editMode: true }));
    expect(reducer.getEnvironments(ctx.editorState())).toEqual(["dev", "prod"]);
    expect(appPercyConfig).toEqual({ key1: "value1" });
  it("PageLoad action fail, alert dialog should show", async () => {
    spyOn(fileService, "getEnvironments").and.throwError("Mock error");
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: true }));
        message: "Mock error",
        alertType: "go-to-dashboard"
  it("GetFileContentSuccess action should be successful", async () => {
  it("ConfigurationChange action should be successful", async () => {
    spyOn(fileService, "getEnvironments").and.returnValue(["dev", "prod"]);
    newConfig.default.addChild(new TreeNode("key"));
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: false }));
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: true }));
  it("SaveDraft action should be successful", async () => {
  it("SaveDraftSuccess action should be successful", async () => {
  it("SaveDraftFailure action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.SaveDraftFailure(new Error("Mock error")));
  it("CommitChanges action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.CommitChanges({ files: [], fromEditor: false, message: "" }));
    ctx.store.dispatch(new BackendActions.CommitChanges({ files: [], fromEditor: true, message: "" }));
  it("CommitChangesSuccess action should be successful", async () => {
  it("CommitChangesFailure action should be successful", async () => {
    ctx.store.dispatch(new BackendActions.CommitChanges({ files: [], fromEditor: true, message: "" }));
      { error: new Error("mock error"), files: [], fromEditor: false, commitMessage: "" }));
      { error: new Error("mock error"), files: [], fromEditor: true, commitMessage: "" }));