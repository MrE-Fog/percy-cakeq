import { SETUP, TestContext, TEST_USER } from "test/test-helper";

import { CreateBranchDialogComponent } from "./create-branch-dialog.component";
import { percyConfig } from "config";

describe("CreateBranchDialogComponent", () => {

  const setup = SETUP(CreateBranchDialogComponent, false);
  const branches = [TEST_USER.branchName, "branch1", "branch2"];

  let ctx: TestContext<CreateBranchDialogComponent>;

  beforeEach(async () => {
    ctx = setup();

    const data = {
      branches,
    };
    ctx.component.data = data;
    ctx.detectChanges();

    await ctx.asyncWait();
  });

  it("should create CreateBranchDialogComponent", () => {
    expect(ctx.component).toBeTruthy();
  });

  it("new branch name should be required", async () => {
    ctx.component.newBranchName.setValue("");
    ctx.component.createBranch();
    expect(ctx.component.newBranchName.hasError("required")).toBeTruthy();
  });

  it("new branch name should follow valid pattern", async () => {
    ctx.component.newBranchName.setValue("@#*U)!(");
    ctx.component.createBranch();
    expect(ctx.component.newBranchName.hasError("pattern")).toBeTruthy();
  });

  it("new branch name should not be duplicate", async () => {
    ctx.component.newBranchName.setValue(TEST_USER.branchName);
    ctx.component.createBranch();
    expect(ctx.component.newBranchName.hasError("duplicate")).toBeTruthy();
  });

  it("new branch name should not be locked", async () => {
    ctx.component.newBranchName.setValue(percyConfig.lockedBranches[0]);
    ctx.component.createBranch();
    expect(ctx.component.newBranchName.hasError("locked")).toBeTruthy();
  });

  it("create new branch should be successful", async () => {
    ctx.component.newBranchName.setValue("new-branch");
    ctx.component.createBranch();
    expect(ctx.dialogStub.output.value).toEqual("new-branch");
  });
});
