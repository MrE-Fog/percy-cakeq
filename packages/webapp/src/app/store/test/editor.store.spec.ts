import { ConfigFile, Configuration, FileTypes } from "models/config-file";
import { percyConfig, appPercyConfig } from "config";
import { PageLoad, ConfigurationChange, FileContentChange } from "../actions/editor.actions";
const percyFileContent = JSON.stringify({ key: "value" });

  fileType: FileTypes.YAML,
  fileType: FileTypes.YAML,
const file3: ConfigFile = {
  fileName: "test.md",
  applicationName: "app1",
  fileType: FileTypes.MD,
  modified: false,
  oid: "333333",
  originalContent: "original",
};

const file4: ConfigFile = {
  fileName: ".percyrc",
  applicationName: percyConfig.yamlAppsFolder,
  fileType: FileTypes.PERCYRC,
  modified: false,
  oid: "444444",
  originalContent: percyFileContent,
};

const file5: ConfigFile = {
  fileName: "test2.md",
  applicationName: "",
  fileType: FileTypes.MD,
  modified: true,
  oid: "555555",
  draftContent: "draft",
  originalContent: "original",
};

  it("PageLoad action should be successful for add new yaml file mode", async () => {
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: false, fileType: FileTypes.YAML }));
      fileType: FileTypes.YAML,
      draftContent: null,
  it("PageLoad action should be successful for add new non yaml file mode", async () => {
    const spy = spyOn(fileService, "getEnvironments");

    spy.and.returnValue({ environments: ["dev", "prod"], appPercyConfig: { key: "value" } });

    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "", editMode: false, fileType: FileTypes.MD }));
    expect(ctx.editorState().editMode).toBeFalsy();
    await ctx.fixture.whenStable();
    await ctx.fixture.whenStable();

    const file: ConfigFile = {
      fileName: null,
      applicationName: "",
      fileType: FileTypes.MD,
      draftContent: "",
      draftConfig: null,
      modified: true
    };
    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file);
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toBeTruthy();
    expect(appPercyConfig).toEqual({ key: "value" });

    expect(reducer.getEnvironments(ctx.editorState())).toEqual(["dev", "prod"]);
  });

  it("PageLoad action should be successful for edit yaml file mode", async () => {
      fileName: "test.yaml", applicationName: "app1", fileType: FileTypes.YAML, originalConfig: new Configuration()
    ctx.store.dispatch(new PageLoad({ fileName: "test.yaml", applicationName: "app1", editMode: true, fileType: FileTypes.YAML }));
  it("PageLoad action should be successful for edit non yaml file mode", async () => {
    const spy = spyOn(fileService, "getEnvironments");
    spy.and.returnValue({ environments: ["dev", "prod"], appPercyConfig: { key1: "value1" } });

    const file: ConfigFile = {
      fileName: "test.md", applicationName: "app1", fileType: FileTypes.MD, originalContent: "original"
    };
    spyOn(fileService, "getFileContent").and.returnValue(file);

    ctx.store.dispatch(new PageLoad({ fileName: "test.md", applicationName: "app1", editMode: true, fileType: FileTypes.MD }));
    expect(ctx.editorState().editMode).toBeTruthy();
    await ctx.fixture.whenStable();
    await ctx.fixture.whenStable();

    expect(reducer.getEnvironments(ctx.editorState())).toEqual(["dev", "prod"]);

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file);
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toBeFalsy();
    expect(appPercyConfig).toEqual({ key1: "value1" });
  });

      fileName: "test.yaml", applicationName: "app1", fileType: FileTypes.YAML, originalConfig: new Configuration()
    ctx.store.dispatch(new PageLoad({ fileName: "test.yaml", applicationName: "app1", editMode: true, fileType: FileTypes.YAML }));
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: true, fileType: FileTypes.YAML }));

    ctx.store.dispatch(new BackendActions.GetFileContentSuccess({ file: file3 }));
    await ctx.fixture.whenStable();

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file3);
    expect(reducer.getConfigFile(ctx.editorState()) !== file3).toBeTruthy();
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(true);

    ctx.store.dispatch(new BackendActions.GetFileContentSuccess({ file: file4 }));
    await ctx.fixture.whenStable();

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file4);
    expect(reducer.getConfigFile(ctx.editorState()) !== file4).toBeTruthy();
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(true);

    ctx.store.dispatch(new BackendActions.GetFileContentSuccess({ file: file5 }));
    await ctx.fixture.whenStable();

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file5);
    expect(reducer.getConfigFile(ctx.editorState()) !== file5).toBeTruthy();
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(true);
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: false, fileType: FileTypes.YAML }));
    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "app1", editMode: true, fileType: FileTypes.YAML }));
  it("FileContentChange action should be successful", async () => {
    spyOn(fileService, "getEnvironments").and.returnValue(["dev", "prod"]);

    ctx.store.dispatch(new PageLoad({ fileName: null, applicationName: "", editMode: false, fileType: FileTypes.MD }));
    ctx.store.dispatch(new BackendActions.GetFileContentSuccess({ file: file5 }));
    ctx.store.dispatch(new FileContentChange("new content"));
    await ctx.fixture.whenStable();

    expect(reducer.getConfigFile(ctx.editorState())).toEqual({ ...file5, modified: true });
    expect(reducer.getConfiguration(ctx.editorState())).toBeNull();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(true);
  });


    ctx.store.dispatch(new BackendActions.SaveDraftSuccess(file5));

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file5);
    expect(reducer.getConfigFile(ctx.editorState()) !== file5).toBeTruthy();
    expect(reducer.getConfigFile(ctx.editorState()).draftContent === file5.draftContent).toBeTruthy();
    expect(reducer.getConfiguration(ctx.editorState())).toBeUndefined();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(false);
    expect(reducer.isSaving(ctx.editorState())).toEqual(false);

    ctx.store.dispatch(new BackendActions.CommitChangesSuccess({ files: [file3], fromEditor: true }));

    expect(reducer.getConfigFile(ctx.editorState())).toEqual(file3);
    expect(reducer.getConfigFile(ctx.editorState()) !== file3).toBeTruthy();
    expect(reducer.getConfiguration(ctx.editorState())).toBeUndefined();
    expect(reducer.getIsPageDirty(ctx.editorState())).toEqual(false);
    expect(reducer.isSaving(ctx.editorState())).toEqual(false);