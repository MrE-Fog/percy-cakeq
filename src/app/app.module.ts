import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { HIGHLIGHT_OPTIONS } from 'ngx-highlightjs';
import * as yaml from 'highlight.js/lib/languages/yaml';

// angular material components
import { MaterialComponentsModule } from 'material-components/material-components.module';

// app routing module
import { AppRoutingModule } from 'app-routing.module';

// services
import { UtilService } from 'services/util.service';
import { InitGuardService } from 'services/init-guard.service';
import { AuthGuardService } from 'services/auth-guard.service';
import { FileManagementService } from 'services/file-management.service';

// main app component
import { AppComponent } from 'app.component';

// pages
import { LoginComponent } from 'pages/login/login.component';
import { DashboardComponent } from 'pages/dashboard/dashboard.component';
import { EditorComponent } from 'pages/editor/editor.component';

// components
import { InitComponent } from 'components/init/init.component';
import { LayoutComponent } from 'components/layout/layout.component';
import { MainHeaderComponent } from 'components/main-header/main-header.component';
import { LoaderComponent } from 'components/loader/loader.component';
import { AddEditPropertyDialogComponent } from 'components/add-edit-property-dialog/add-edit-property-dialog.component';
import { NestedConfigViewComponent } from 'components/nested-config-view/nested-config-view.component';
import { ConfirmationDialogComponent } from 'components/confirmation-dialog/confirmation-dialog.component';
import { CommitDialogComponent } from 'components/commit-dialog/commit-dialog.component';
import { SelectAppDialogComponent } from 'components/select-app-dialog/select-app-dialog.component';
import { AlertDialogComponent } from 'components/alert-dialog/alert-dialog.component';
import { ConflictDialogComponent } from 'components/conflict-dialog/conflict-dialog.component';
import { CanDeactivateGuard } from 'services/can-deactivate-guard.service';
import { StoreModule } from '@ngrx/store';
import { reducers, metaReducers } from 'store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { environment } from '../environments/environment';
import { EffectsModule } from '@ngrx/effects';
import { AppEffects } from 'store/affects/app.effects';
import { BackendEffects } from 'store/affects/backend.effects';
import { DashboardEffects } from 'store/affects/dashboard.effects';
import { AuthEffects } from 'store/affects/auth.effects';
import { EditorEffects } from 'store/affects/editor.effects';
import { LocationStrategy, HashLocationStrategy } from '@angular/common';

// directives
import { SplitDirective } from 'directives/splitter.directive';
import { HighlightDirective } from 'directives/highlight.directive';
import { FollowCursorDirective } from 'directives/follow-cursor.directive';

export const hljsLanguages = () => [{ name: 'yaml', func: yaml }];

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    InitComponent,
    DashboardComponent,
    LayoutComponent,
    MainHeaderComponent,
    EditorComponent,
    LoaderComponent,
    AddEditPropertyDialogComponent,
    NestedConfigViewComponent,
    CommitDialogComponent,
    SelectAppDialogComponent,
    ConfirmationDialogComponent,
    AlertDialogComponent,
    ConflictDialogComponent,
    SplitDirective,
    HighlightDirective,
    FollowCursorDirective,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    MaterialComponentsModule,
    StoreModule.forRoot(reducers, { metaReducers }),
    !environment.production ? StoreDevtoolsModule.instrument() : [],
    EffectsModule.forRoot([AuthEffects, AppEffects, BackendEffects, DashboardEffects, EditorEffects])
  ],
  entryComponents: [
    AddEditPropertyDialogComponent,
    CommitDialogComponent,
    SelectAppDialogComponent,
    ConfirmationDialogComponent,
    AlertDialogComponent,
    ConflictDialogComponent
  ],
  providers: [
    UtilService,
    AuthGuardService,
    InitGuardService,
    FileManagementService,
    CanDeactivateGuard,
    { provide: HIGHLIGHT_OPTIONS, useValue: { languages: hljsLanguages } },
    { provide: LocationStrategy, useClass: HashLocationStrategy }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }