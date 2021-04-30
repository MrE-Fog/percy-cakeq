import * as HttpErrors from "http-errors";
import { TEST_USER, SETUP, TestContext } from "test/test-helper";

import { percyConfig } from "config";
import { LoginRedirect, LoginSuccess, LoginFailure } from "store/actions/auth.actions";
import { MaintenanceService } from "services/maintenance.service";

import { LoginComponent } from "./login.component";

describe("LoginComponent", () => {
  const setup = SETUP(LoginComponent);

  let ctx: TestContext<LoginComponent>;
  let maintenanceService: MaintenanceService;
  let dispatchSpy: jasmine.Spy;

  beforeEach(() => {
    ctx = setup();
    maintenanceService = ctx.resolve(MaintenanceService);
    dispatchSpy = spyOn(ctx.store, "dispatch");
  });

  it("should create LoginComponent", () => {
    expect(ctx.component).toBeTruthy();
  });

  it("should redirect to dashboard page if already logged in", () => {

    ctx.store.next(new LoginSuccess(TEST_USER));

    expect(ctx.routerStub.value).toEqual(["/dashboard"]);
  });

  it("should redirect to given page if already logged in", () => {

    ctx.store.next(new LoginRedirect({ redirectUrl: "/redirect-to" }));
    ctx.store.next(new LoginSuccess(TEST_USER));

    expect(ctx.routerStub.value).toEqual(["/redirect-to"]);
  });

  it("should show default repo url and branch", () => {
    expect(ctx.component.repositoryURL.value).toEqual(percyConfig.defaultRepositoryUrl);
  });

  it("should show auto complete prompt for username", async () => {
    const usernames = [
      "Mike",
      "Muller",
    ];
    spyOn(maintenanceService, "getUserTypeAhead").and.returnValue(Promise.resolve(usernames));

    ctx.component.username.setValue("m");
    await new Promise(resolve => setTimeout(resolve, 250)); // wait for debouce time
    expect(ctx.observables.filteredUsernames.value).toEqual(["Mike", "Muller"]);

    ctx.component.username.setValue("mi");
    await new Promise(resolve => setTimeout(resolve, 250)); // wait for debouce time
    expect(ctx.observables.filteredUsernames.value).toEqual(["Mike"]);

    ctx.component.username.setValue("mouse");
    await new Promise(resolve => setTimeout(resolve, 250)); // wait for debouce time
    expect(ctx.observables.filteredUsernames.value).toEqual([]);
  });

  it("input should trigger auto complete change", () => {
    ctx.component.username.setValue("");
    expect(ctx.component.username.valid).toBeFalsy();

    const target = { value: "test-user" };

    const event = new KeyboardEvent("click");
    spyOnProperty(event, "currentTarget", "get").and.returnValue(target);

    const eleSyp = spyOnProperty(document, "activeElement", "get");

    eleSyp.and.returnValue(target);
    ctx.component.onInput(event);
    expect(ctx.component.username.valid).toBeFalsy();

    eleSyp.and.returnValue({});
    ctx.component.onInput(event);

    expect(ctx.component.username.value).toEqual(target.value);
    expect(ctx.component.username.valid).toBeTruthy();
  });

  it("required input missing, should not login", () => {
    ctx.component.login();

    expect(ctx.component.username.hasError("required")).toBeTruthy();
    expect(ctx.component.password.hasError("required")).toBeTruthy();
    expect(dispatchSpy.calls.count()).toEqual(0);
  });

  it("invalid url, should not login", () => {
    ctx.component.username.setValue(TEST_USER.username);
    ctx.component.username.setErrors(null);
    ctx.component.password.setValue("test-pass");
    ctx.component.password.setErrors(null);
    ctx.component.repositoryURL.setValue("Not a valid url");
    ctx.component.login();

    expect(ctx.component.repositoryURL.hasError("pattern")).toBeTruthy();
    expect(dispatchSpy.calls.count()).toEqual(0);
  });

  it("login function should work", () => {

    ctx.component.username.setValue(TEST_USER.username);
    ctx.component.username.setErrors(null);
    ctx.component.password.setValue("test-pass");
    ctx.component.password.setErrors(null);
    ctx.component.repositoryURL.setValue(TEST_USER.repositoryUrl);
    ctx.component.repositoryURL.setErrors(null);
    ctx.component.login();

    const payload = dispatchSpy.calls.mostRecent().args[0].payload;
    expect(payload).toEqual({
      repositoryUrl: TEST_USER.repositoryUrl,
      username: TEST_USER.username,
      password: "test-pass"
    });
  });

  it("should show login error propery", () => {
    expect(ctx.component.loginError).toBeNull();

    ctx.store.next(new LoginFailure(new HttpErrors.Unauthorized("mock error")));
    expect(ctx.component.password.hasError("invalid")).toBeTruthy();

    ctx.store.next(new LoginFailure(new HttpErrors.Forbidden("mock error")));
    expect(ctx.component.repositoryURL.hasError("forbidden")).toBeTruthy();

    ctx.store.next(new LoginFailure(new HttpErrors.NotFound("Repository not found")));
    expect(ctx.component.repositoryURL.hasError("notFound")).toBeTruthy();

    ctx.store.next(new LoginFailure(new HttpErrors.InternalServerError("mock error")));
    expect(ctx.component.loginError).toEqual("Login failed");

    ctx.component.inputChange();
    expect(ctx.component.loginError).toBeNull();
  });
});
