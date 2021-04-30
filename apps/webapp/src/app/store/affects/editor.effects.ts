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

import { Injectable } from "@angular/core";
import { Store, select } from "@ngrx/store";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { map, withLatestFrom, switchMap } from "rxjs/operators";
import * as _ from "lodash";

import { appPercyConfig } from "config";

import { ConfigFile, Configuration, FileTypes } from "models/config-file";

import * as appStore from "..";
import { Alert } from "../actions/common.actions";
import {
  EditorActionTypes,
  PageLoad,
  PageLoadSuccess,
  PageLoadFailure,
} from "../actions/editor.actions";
import { GetFileContentSuccess } from "store/actions/backend.actions";
import { getConfigFile } from "store/reducers/backend.reducers";

import { FileManagementService } from "services/file-management.service";

// defines the editor page related effects
@Injectable()
export class EditorEffects {
  constructor(
    private actions$: Actions,
    private store: Store<appStore.AppState>,
    private fileManagementService: FileManagementService,
  ) { }

  // handles the page load request
  pageLoad$ = createEffect(() => this.actions$.pipe(
    ofType<PageLoad>(EditorActionTypes.PageLoad),
    withLatestFrom(this.store.pipe(select(appStore.getAppState))),
    switchMap(async ([action, appState]) => {

      // Reset appPercyConfig
      _.keys(appPercyConfig).forEach(key => delete appPercyConfig[key]);

      const fileName = action.payload.fileName;
      const fileType = action.payload.fileType;
      const applicationName = action.payload.applicationName;
      const principal = appState.backend.principal;

      const result = [];
      const promises = [];

      try {

        promises.push(this.fileManagementService.getEnvironments(principal, applicationName));

        if (!action.payload.editMode) {
          // Add new file, set an initial config
          const file: ConfigFile = {
            fileName,
            fileType,
            applicationName,
            draftConfig: fileType === FileTypes.YAML ? new Configuration() : null,
            draftContent: fileType === FileTypes.YAML ? null : "",
            modified: true
          };
          result.push(new GetFileContentSuccess({ file, newlyCreated: true }));
        } else {
          const file = getConfigFile(appState.backend, fileName, applicationName);

          if (file && (
                (file.fileType === FileTypes.YAML && (file.originalConfig || file.draftConfig)) ||
                (file.fileType !== FileTypes.YAML && (file.originalContent || file.draftContent))
            )) { // Newly added (but uncommitted) file has only draft config
            result.push(new GetFileContentSuccess({ file }));
          } else {
            promises.push(
              this.fileManagementService.getFileContent(principal, file ? { ...file } : { fileName, applicationName, fileType })
            );
          }
        }

        const promiseResult = await Promise.all(promises);
        result.push(new PageLoadSuccess(promiseResult[0]));

        // Set app's specific percy config
        _.assign(appPercyConfig, promiseResult[0].appPercyConfig);

        if (promiseResult[1]) {
          result.push(new GetFileContentSuccess({ file: promiseResult[1] }));
        }

        return result;
      } catch (error) {
        return [new PageLoadFailure(error)];
      }
    }),
    switchMap(res => res),
  ));

  // load environment failure effect
  pageLoadFailure$ = createEffect(() => this.actions$.pipe(
    ofType<PageLoadFailure>(EditorActionTypes.PageLoadFailure),
    map((action) => {
      const alertType = action.payload.statusCode === 401 || action.payload.statusCode === 403 ? "logout" : "go-to-dashboard";
      return new Alert({
        message: action.payload.message,
        alertType
      });
    })
  ));
}
