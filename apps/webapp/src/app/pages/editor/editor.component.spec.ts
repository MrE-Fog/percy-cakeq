import { convertToParamMap } from "@angular/router";

import { SETUP, assertDialogOpened, TestContext } from "test/test-helper";

import { appPercyConfig, percyConfig } from "config";
import { TreeNode, PROPERTY_VALUE_TYPES } from "models/tree-node";
import { Configuration, FileTypes } from "models/config-file";
import { Alert } from "store/actions/common.actions";

import { PageLoadSuccess, ConfigurationChange } from "store/actions/editor.actions";
import { LoadFilesSuccess, GetFileContentSuccess, SaveDraft, CommitChanges } from "store/actions/backend.actions";

import { CommitDialogComponent } from "components/commit-dialog/commit-dialog.component";
import { ConfirmationDialogComponent } from "components/confirmation-dialog/confirmation-dialog.component";

import { EditorPageComponent } from "./editor.component";
import { of } from "rxjs";

describe("EditorPageComponent", () => {
  const setup = SETUP(EditorPageComponent, false);

  const file = {
    applicationName: "app1",
    fileName: "sample.yaml",
    fileType: FileTypes.YAML,
    oid: "111111",
  };
  const applications = ["app1", "app2", "app3"];

  let ctx: TestContext<EditorPageComponent>;
  let dispatchSpy: jasmine.Spy;

  beforeEach(() => {
    ctx = setup();
    const backup = ctx.store.dispatch;
    dispatchSpy = spyOn(ctx.store, "dispatch");
    dispatchSpy.and.callFake((action) => {
      if (action instanceof Alert || action instanceof ConfigurationChange) {
        return backup.apply(ctx.store, [action]);
      }
    });
  });

  it("should create EditorPageComponent", () => {
    expect(ctx.component).toBeTruthy();
  });

  it("should init EditorPageComponent with edit yaml file mode", () => {
    ctx.activatedRouteStub.snapshot = {
      data: {
        editMode: true,
        envFileMode: false,
        rootFile: false,
      },
      paramMap: convertToParamMap({
        appName: file.applicationName,
        fileName: file.fileName
      })
    };
    ctx.detectChanges();

    expect(dispatchSpy.calls.count()).toEqual(1);

    const pageLoad = dispatchSpy.calls.argsFor(0)[0].payload;
    expect(pageLoad).toEqual({ fileName: file.fileName, applicationName: file.applicationName, editMode: true, fileType: FileTypes.YAML });

  });

  const appsFile = {
    applicationName: percyConfig.yamlAppsFolder,
    fileName: ".percyrc",
    fileType: FileTypes.PERCYRC,
    oid: "555555"
  };

  it("should init EditorPageComponent with edit non yaml file mode", () => {
    ctx.activatedRouteStub.snapshot = {
      data: {
        editMode: true,
        envFileMode: false,
        rootFile: false,
      },
      paramMap: convertToParamMap({
        appName: appsFile.applicationName,
        fileName: appsFile.fileName
      })
    };
    ctx.detectChanges();

    expect(dispatchSpy.calls.count()).toEqual(1);

    const pageLoad = dispatchSpy.calls.argsFor(0)[0].payload;
    expect(pageLoad).toEqual({
      fileName: appsFile.fileName, applicationName: appsFile.applicationName, editMode: true, fileType: appsFile.fileType
    });

  });

  const rootFile = {
    applicationName: "",
    fileName: "test.md",
    fileType: FileTypes.MD,
    oid: "555555"
  };

  it("should init EditorPageComponent with edit root file mode", () => {
    ctx.activatedRouteStub.snapshot = {
      data: {
        editMode: true,
        envFileMode: false,
        rootFile: true,
      },
      paramMap: convertToParamMap({
        appName: rootFile.applicationName,
        fileName: rootFile.fileName
      })
    };
    ctx.detectChanges();

    expect(dispatchSpy.calls.count()).toEqual(1);

    const pageLoad = dispatchSpy.calls.argsFor(0)[0].payload;
    expect(pageLoad).toEqual({
      fileName: rootFile.fileName, applicationName: rootFile.applicationName, editMode: true, fileType: rootFile.fileType
    });

  });

  const initNewFileMode = async (newFile) => {

    ctx.activatedRouteStub.snapshot = {
      data: {
        editMode: false,
        envFileMode: false,
        rootFile: newFile.applicationName === ""
      },
      paramMap: convertToParamMap({
        appName: newFile.applicationName,
        fileType: newFile.fileType
      })
    };
    ctx.detectChanges();

    expect(dispatchSpy.calls.count()).toEqual(1);

    const pageLoad = dispatchSpy.calls.argsFor(0)[0].payload;
    expect(pageLoad).toEqual({ fileName: null, applicationName: newFile.applicationName, editMode: false, fileType: newFile.fileType });

    ctx.store.next(new LoadFilesSuccess({ files: [newFile], applications, appConfigs: {} }));
    ctx.store.next(new PageLoadSuccess({ environments: ["dev"] }));
    ctx.store.next(new GetFileContentSuccess({file: newFile, newlyCreated: true}));

    ctx.detectChanges();
    await ctx.asyncWait();
  };

  const newFile1 = {
    fileName: null,
    applicationName: "app1",
    fileType: FileTypes.YAML,
    draftConfig: new Configuration(),
    modified: true
  };

  it("should not save draft if validation failed", async () => {
    await initNewFileMode(newFile1);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue(of({ valid: false }));
    ctx.component.editor = spy;

    ctx.component.saveConfig();

    expect(dispatchSpy.calls.mostRecent().args[0] instanceof SaveDraft).toBeFalsy();
  });

  // it('should not save draft if yaml config is invalid', async () => {
  //   await initNewFileMode();

  //   const config = new Configuration();
  //   config.default.addChild(new TreeNode('key1', PROPERTY_VALUE_TYPES.STRING, utilService.constructVariable('key1')));
  //   config.environments.addChild(new TreeNode('dev'));

  //   ctx.component.editor.onConfigChange(config);

  //   ctx.component.editor.filename.setValue('test.yaml');
  //   ctx.component.saveConfig();

  //   assertDialogOpened(AlertDialogComponent, {
  //     data: { message: `YAML validation failed:\nLoop variable reference: key1->key1`, alertType: 'error' },
  //   });
  //   expect(dispatchSpy.calls.mostRecent().args[0] instanceof SaveDraft).toBeFalsy();
  // });

  it("should save draft if file name and yaml config invalid", async () => {
    await initNewFileMode(newFile1);

    const configuration = new Configuration();
    configuration.default.addChild(new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "aaa"));
    configuration.default.addChild(new TreeNode("key2", PROPERTY_VALUE_TYPES.STRING, "bbb"));
    configuration.environments.addChild(new TreeNode("dev"));

    const spy = jasmine.createSpyObj("", ["validate", "getFileName"]);
    spy.validate.and.returnValue(of({ valid: true, editorState: {configuration, configFile: newFile1} }));
    spy.getFileName.and.returnValue("test.yaml");
    ctx.component.editor = spy;

    ctx.component.saveConfig();

    expect(dispatchSpy.calls.mostRecent().args[0].payload).toEqual(
      {
        file: {
          fileName: "test.yaml",
          applicationName: "app1",
          fileType: FileTypes.YAML,
          draftConfig: configuration,
          modified: true,
        },
        redirect: true
      }
    );
  });

  it("should not commit file if file name is invalid", async () => {
    await initNewFileMode(newFile1);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue(of({ valid: false }));
    ctx.component.editor = spy;

    ctx.component.commitFile();

    expect(dispatchSpy.calls.mostRecent().args[0] instanceof CommitChanges).toBeFalsy();
  });

  // it('should not commit file if yaml config is invalid', async () => {
  //   await initNewFileMode();

  //   const config = new Configuration();
  //   config.default.addChild(new TreeNode('key1', PROPERTY_VALUE_TYPES.STRING, utilService.constructVariable('key1')));
  //   config.environments.addChild(new TreeNode('dev'));

  //   ctx.component.editor.onConfigChange(config);

  //   ctx.component.editor.filename.setValue('test.yaml');
  //   ctx.component.saveConfig();

  //   assertDialogOpened(AlertDialogComponent, {
  //     data: { message: `YAML validation failed:\nLoop variable reference: key1->key1`, alertType: 'error' },
  //   });
  //   expect(dispatchSpy.calls.mostRecent().args[0] instanceof CommitChanges).toBeFalsy();
  // });

  it("should commit file if file name and yaml config invalid", async () => {
    await initNewFileMode(newFile1);

    const configuration = new Configuration();
    configuration.default.addChild(new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "aaa"));
    configuration.default.addChild(new TreeNode("key2", PROPERTY_VALUE_TYPES.STRING, "bbb"));
    configuration.environments.addChild(new TreeNode("dev"));

    const spy = jasmine.createSpyObj("", ["validate", "getFileName"]);
    spy.validate.and.returnValue(of({ valid: true, editorState: {configuration, configFile: newFile1} }));
    spy.getFileName.and.returnValue("test.yaml");
    ctx.component.editor = spy;

    ctx.component.commitFile();

    assertDialogOpened(CommitDialogComponent);
    ctx.dialogStub.output.next("some commit message");

    expect(dispatchSpy.calls.mostRecent().args[0].payload).toEqual(
      {
        files: [{
          fileName: "test.yaml",
          applicationName: "app1",
          fileType: FileTypes.YAML,
          draftConfig: configuration,
          modified: true,
        }],
        message: "some commit message",
        fromEditor: true
      }
    );
  });

  const newFile2 = {
    fileName: null,
    applicationName: "",
    fileType: FileTypes.MD,
    draftContent: "draft",
    modified: true
  };

  it("should not save file content if validation failed", async () => {
    await initNewFileMode(newFile2);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue({ valid: false });
    ctx.component.textEditor = spy;

    ctx.component.saveFileContent();

    expect(dispatchSpy.calls.mostRecent().args[0] instanceof SaveDraft).toBeFalsy();
  });

  it("should save file content if file name is valid", async () => {
    await initNewFileMode(newFile2);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue({ valid: true, file: { ...newFile2, fileName: "test.md" }, fileContent: "new content" });
    ctx.component.textEditor = spy;

    ctx.component.saveFileContent();

    expect(dispatchSpy.calls.mostRecent().args[0].payload).toEqual(
      {
        file: {
          fileName: "test.md",
          applicationName: "",
          fileType: FileTypes.MD,
          draftContent: "new content",
          modified: true,
        },
        redirect: true
      }
    );
  });

  it("should not commit file content if validation failed", async () => {
    await initNewFileMode(newFile2);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue({ valid: false });
    ctx.component.textEditor = spy;

    ctx.component.commitFileContent();

    expect(dispatchSpy.calls.mostRecent().args[0] instanceof CommitChanges).toBeFalsy();
  });

  it("should commit file content if file name is valid", async () => {
    await initNewFileMode(newFile2);

    const spy = jasmine.createSpyObj("", ["validate"]);
    spy.validate.and.returnValue({ valid: true, file: { ...newFile2, fileName: "test.md" }, fileContent: "new content" });
    ctx.component.textEditor = spy;

    ctx.component.commitFileContent();

    assertDialogOpened(CommitDialogComponent);
    ctx.dialogStub.output.next("some commit message");

    expect(dispatchSpy.calls.mostRecent().args[0].payload).toEqual(
      {
        files: [{
          fileName: "test.md",
          applicationName: "",
          fileType: FileTypes.MD,
          draftContent: "new content",
          modified: true,
        }],
        message: "some commit message",
        fromEditor: true
      }
    );
  });

  it("should prevent to leave page", () => {
    const event: any = {};

    ctx.component.isPageDirty = false;
    ctx.component.onLeavePage(event);
    expect(event.returnValue).toBeFalsy();
    expect(ctx.component.canDeactivate()).toBeTruthy();

    ctx.component.isPageDirty = true;
    ctx.component.onLeavePage(event);
    expect(event.returnValue).toBeTruthy();

    ctx.component.canDeactivate();
    assertDialogOpened(ConfirmationDialogComponent, {
      data: {
        confirmationText: "There may be unsaved changes.\nAre you sure you want to navigate away from the page?"
      }
    });
    ctx.dialogStub.output.next(true);
  });

  it("should reset app percy config when component destory", () => {
    appPercyConfig["key1"] = "value1";
    appPercyConfig["key2"] = "value2";

    ctx.component.ngOnDestroy();

    expect(appPercyConfig).toEqual({});
  });
});
