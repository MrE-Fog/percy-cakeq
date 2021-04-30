/**
=========================================================================
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

import { Component, Inject, OnInit } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import * as _ from "lodash";

import { ConfigFile, ConflictFile, FileTypes } from "models/config-file";

/**
 * The conflict dialog component
 */
@Component({
  selector: "app-conflict-dialog",
  templateUrl: "./conflict-dialog.component.html",
  styleUrls: ["./conflict-dialog.component.scss"]
})
export class ConflictDialogComponent implements OnInit {
  fileTypes = FileTypes;
  fileIdx = 0;

  /**
   * initializes the component
   *
   * @param dialogRef the reference to a dialog opened via the MatDialog service
   * @param data the injection token that can be used to access the data that was passed in to a dialog
   */
  constructor(
    public dialogRef: MatDialogRef<ConflictDialogComponent>,
    // private yamlService: YamlService,
    @Inject(MAT_DIALOG_DATA) public data
  ) {
    dialogRef.disableClose = true;
  }

  ngOnInit() {
    this.data.conflictFiles = this.data.conflictFiles.sort((a, b) => {
      if (a.applicationName < b.applicationName) {
        return -1;
      } else if (a.applicationName > b.applicationName) {
        return 1;
      } else if (a.fileName < b.fileName) {
        return -1;
      } else if (a.fileName > b.fileName) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  setFileIdx(_fileIdx: number) {
    this.fileIdx = _fileIdx;
  }

  resolveConflict($event, file: ConflictFile) {
    file.resolveStrategy = $event.value;
  }

  allResolved() {
    return !_.filter(this.data.conflictFiles, f => !f.resolveStrategy).length;
  }

  /**
   * handles the confirm action
   */
  confirmAction() {
    // Convert conflict files
    const files = this.data.conflictFiles.map((file: ConflictFile) => {
      const result: ConfigFile = {
        fileName: file.fileName,
        fileType: file.fileType,
        applicationName: file.applicationName,
        size: file.size,
        draftContent:
          file.resolveStrategy === "draft"
            ? file.draftContent
            : file.originalContent,
        originalContent: file.originalContent,
        draftConfig:
          file.resolveStrategy === "draft"
            ? file.draftConfig
            : file.originalConfig,
        originalConfig: file.originalConfig
      };

      return result;
    });

    this.dialogRef.close(files);
  }
}
