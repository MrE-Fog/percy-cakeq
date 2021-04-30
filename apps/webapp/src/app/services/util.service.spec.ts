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

import * as cheerio from "cheerio";

import { TreeNode, PROPERTY_VALUE_TYPES } from "models/tree-node";
import { Configuration } from "models/config-file";
import { percyConfig } from "config";
import { TEST_USER, utilService } from "test/test-helper";

import { git } from "./util.service";

const constructVar = utilService.constructVariable;

describe("UtilService", () => {
  it("should initialize git and browser fs", async () => {
    const fs = await utilService.getBrowserFS();

    expect(git.version()).toBeDefined();

    expect(await fs.pathExists(percyConfig.reposFolder)).toBeTruthy();

    expect(await fs.pathExists(percyConfig.metaFolder)).toBeTruthy();

    expect(await fs.pathExists(percyConfig.draftFolder)).toBeTruthy();
  });

  const sampleYaml = `###
# Sample yaml.
#
# @author TCSCODER
# @version 1.0
# @copyright Copyright (c) 2018 TopCoder, Inc. All rights reserved.
###

default: !!map  # all known properties are defined in the default block.
  # The most common values are assigned in the default block
  appVer: !!str "0.1.0"  # appVer comment line1
    # appVer comment line2
  host: !!str "www.mobilex.com"  # The url domain for the deployed environment
  dataService: !!str "pod01.mobilex.com/data"  # url to access JSON Web API
  myProp: !!bool true  # myProp comment line1
    # myProp comment line2
    #
environments: !!map  # specific environments can override the default values 1 property at a time
  qat: !!map  # qat team validates all compiled artifacts in separate test environment with their own data service.
    qat-items: !!seq  # array of maps
      - !!map  # map in array comment
        # map in array comment line2
        item1A: !!int 8800
        item1B: !!float -12.3
      - !!map
        item2A: !!str "value2A"  #### value2A comment #####
        item2B: !!str "value2B"  # value2B comment
    host: !!str "{{api.host}}.mobilex.com"
    dataService: !!str "pod03.mobilex.com/data"  # 'qat dataService'
  local: !!map  # local comment line1
    # local comment line2
    host: !!str "localhost"
  dev: !!map  # environment for developer testing of fully compiled and integrated application
    host: !!str "dev.mobilex.com"
    dev-items: !!seq  # dev-items comments
      - !!seq  # nest array comments
        - !!str "\\\\aa\\\\\\"bb\\\\\\"cc"  # nest item1 comment
        - !!str "nest item2 \\\\ "  # nest item2 comment
      - !!str "dev-item2"
      - !!float -12.3
  staging: !!map
    staging-items1: !!seq  # items comment line1
      # items comment line2
      # items comment line3
      - !!str "item1"  # item1 comment
      - !!str "item2"  # item2 comment
      - !!str "item3"
    staging-items2: !!seq
      - !!int 12  # item1 comment
      - !!int 11  # item2 comment
      - !!int 33
    staging-items3: !!seq
      - !!bool true  # item1 comment
      - !!bool false  # item2 comment
      - !!bool true
    host: !!str "staging.mobilex.com"  # host comment line1
      # host comment line2`;

  it("should convert between Yaml and TreeNode", () => {
    const tree = utilService.convertYamlToTree(sampleYaml, false);

    const yaml2 = utilService.convertTreeToYaml(tree);

    expect(yaml2).toEqual(sampleYaml);
  });

  it("should parse and render anchor and aliase", () => {
    const anchorYaml = `
foo: !!map
  <<: !!map &anchor1  # anchor1 comment
    K1: !!str "One"
  <<: !!map &anchor2  # anchor2 comment
    K2: !!str "Two"
  K3: !!str &scalaAnchor "Three"
  arr: !!seq &arrAnchor
    - !!str &itemAnchor "item1"  # item comment line1
      # item comment line2
    - !!str "item2"
  obj: !!map &anchor3
    <<: *anchor1
bar: !!map &anchor4
  K4: !!str "Four"
  K5: !!str "Five"
joe: !!map  # comment line1
  # comment line2
  <<: *anchor1
  <<: *anchor2
  <<: *anchor3
  K3: *scalaAnchor
  K4: !!str "I Changed"
  arr: !!seq
    - *itemAnchor  # alias item comment line1
      # alias item comment line2
  arr2: *arrAnchor  # alias comment line1
    # alias comment line2
  oarr: !!seq
    - *anchor2  # map in array comment line1
      # map in array comment line2
    - *anchor3  # map in array comment line1
      # map in array comment line2
    - *anchor4  # map in array comment line1
      # map in array comment line2
`;

    const tree = utilService.convertYamlToTree(anchorYaml, false);

    const yaml2 = utilService.convertTreeToYaml(tree);

    expect(yaml2).toEqual(anchorYaml.trim());
  });

  it("should parse and render number correctly", () => {
    const numberYaml = `
floats: !!map
  f1: !!float .inf  # positive inifinity
  f2: !!float -.inf  # negative inifinity
  f3: !!float .nan  # not a number
  f4: !!float 1e3
  f5: !!float 9e-9
  f6: !!float 0.99999
  f7: !!float -12.3
  f8: !!float 0.0
ints: !!map
  i1: !!int 8800
  i2: !!int -9900
  i3: !!int 0
`;

    const tree = utilService.convertYamlToTree(numberYaml, false);

    const yaml2 = utilService.convertTreeToYaml(tree);

    expect(yaml2).toEqual(numberYaml.trim());
  });

  it("duplicate anchor should fail", () => {
    const anchorYaml = `
foo: !!map &anchor1
  <<: !!map &anchor1
`;
    try {
      utilService.convertYamlToTree(anchorYaml, false);
      fail("duplicate anchor should fail");
    } catch (err) {
      expect(err.message).toEqual("Found duplicate anchor: anchor1");
    }
  });

  it("undefined anchor should fail", () => {
    const anchorYaml = `
foo: !!map
  <<: *NoSuchAnchor
`;
    try {
      utilService.convertYamlToTree(anchorYaml, false);
      fail("undefined anchor should fail");
    } catch (err) {
      expect(err.message).toEqual("Found undefined anchor: NoSuchAnchor");
    }
  });

  it("simple value type should be converted", () => {
    const yaml = "host: !!str \"staging.mobilex.com\"  # host comment line1";
    const tree = utilService.convertYamlToTree(yaml);
    let yaml2 = utilService.convertTreeToYaml(tree);
    expect(yaml2).toEqual(yaml);

    const config = new Configuration();
    config.default.addChild(
      new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", [
        "comment1",
        "comment2"
      ])
    );
    config.default.addChild(
      new TreeNode("key2", PROPERTY_VALUE_TYPES.BOOLEAN, true, [
        "comment1",
        "comment2"
      ])
    );
    config.default.addChild(
      new TreeNode("key3", PROPERTY_VALUE_TYPES.NUMBER, 10, [
        "comment1",
        "comment2"
      ])
    );

    yaml2 = utilService.convertTreeToYaml(config);
    const config2 = utilService.parseYamlConfig(yaml2, true);

    expect(config2).toEqual(config);
  });

  it("empty array with comment should be converted", () => {
    const config = new Configuration();
    config.default.addChild(
      new TreeNode("array", PROPERTY_VALUE_TYPES.STRING_ARRAY, undefined, [
        "comment1",
        "comment2"
      ])
    );
    config.environments.addChild(new TreeNode("dev"));
    config.environments.addChild(new TreeNode("qat"));

    const yaml = utilService.convertTreeToYaml(config);
    const config2 = utilService.parseYamlConfig(yaml, true);

    expect(config2).toEqual(config);
  });

  it("empty TreeNode should be converted", () => {
    const emptyObj = new TreeNode("", PROPERTY_VALUE_TYPES.OBJECT);
    expect(utilService.convertTreeToYaml(emptyObj)).toEqual("{}");

    const emptyArray = new TreeNode("", PROPERTY_VALUE_TYPES.STRING_ARRAY);
    expect(utilService.convertTreeToYaml(emptyArray)).toEqual("[]");
  });

  it("array with same simple type should be supported", () => {
    const tree: TreeNode = utilService.convertYamlToTree(sampleYaml, true);

    expect(
      tree.findChild(["environments", "staging", "staging-items1"]).children
        .length
    ).toEqual(3);
    expect(
      tree.findChild(["environments", "staging", "staging-items2"]).children
        .length
    ).toEqual(3);
    expect(
      tree.findChild(["environments", "staging", "staging-items3"]).children
        .length
    ).toEqual(3);
  });

  it("should ignore array item which is not same type", () => {
    const tree: TreeNode = utilService.convertYamlToTree(sampleYaml, true);

    expect(
      tree.findChild(["environments", "dev", "dev-items"]).children.length
    ).toEqual(1);
  });

  it("error expected when tree contains invalid yaml content", () => {
    const tree = new TreeNode("");

    tree.addChild(
      new TreeNode("@invalidkey", PROPERTY_VALUE_TYPES.STRING, "value")
    );
    try {
      utilService.convertTreeToYaml(tree);
      fail("error expected");
    } catch (err) {
      expect(err.message.indexOf("@invalidkey") > -1).toBeTruthy();
    }
  });

  it("error expected when compile yaml with loop inherits", () => {
    const config = new Configuration();
    config.default.addChild(
      new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", ["comment1"])
    );
    config.environments.addChild(new TreeNode("dev"));
    config.environments.addChild(new TreeNode("qat"));
    config.environments.addChild(new TreeNode("prod"));
    config.environments
      .findChild(["qat"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "dev"));
    config.environments
      .findChild(["dev"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "prod"));
    config.environments
      .findChild(["prod"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "dev"));

    try {
      utilService.compileYAML("qat", config);
      fail("error expected");
    } catch (err) {
      expect(
        err.message.indexOf("Cylic env inherits detected") > -1
      ).toBeTruthy();
    }

    config.environments.findChild(["qat", "inherits"]).value = "qat";
    try {
      utilService.compileYAML("qat", config);
      fail("error expected");
    } catch (err) {
      expect(
        err.message.indexOf("Cylic env inherits detected") > -1
      ).toBeTruthy();
    }
  });

  it("error expected when compile yaml with loop variable reference", () => {
    const config = new Configuration();
    config.default.addChild(
      new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", ["comment1"])
    );
    config.default.addChild(
      new TreeNode("key2", PROPERTY_VALUE_TYPES.NUMBER, 10, ["comment2"])
    );
    config.default.addChild(
      new TreeNode("key3", PROPERTY_VALUE_TYPES.BOOLEAN, true)
    );
    config.default.addChild(
      new TreeNode(
        "var3",
        PROPERTY_VALUE_TYPES.STRING,
        `${constructVar("var1")}/${constructVar("var2")}/${constructVar(
          "key3"
        )}`
      )
    );
    config.default.addChild(
      new TreeNode(
        "var2",
        PROPERTY_VALUE_TYPES.STRING,
        `${constructVar("var1")}/${constructVar("key2")}`
      )
    );
    config.default.addChild(
      new TreeNode("var1", PROPERTY_VALUE_TYPES.STRING, constructVar("var3"))
    );

    config.environments.addChild(new TreeNode("dev"));
    try {
      console.log(utilService.compileYAML("dev", config));
      fail("error expected");
    } catch (err) {
      expect(err.message.indexOf("Cyclic variable reference") > -1).toBeTruthy();
    }

    config.default.findChild(["var1"]).value = constructVar("var1");
    try {
      utilService.compileYAML("dev", config);
      fail("error expected");
    } catch (err) {
      expect(err.message.indexOf("Cyclic variable reference") > -1).toBeTruthy();
    }
  });

  it("should compile yaml, anchor/alias should be merged", () => {
    const config = new Configuration();
    config.default.addChild(
      new TreeNode("oarr", PROPERTY_VALUE_TYPES.OBJECT_ARRAY, null, [
        "oarr-comment"
      ])
    );
    config.default
      .findChild(["oarr"])
      .addChild(
        new TreeNode("[0]", PROPERTY_VALUE_TYPES.OBJECT, null, ["item0"])
      );
    config.default.findChild(["oarr", "[0]"]).anchor = "oarr-0";
    config.default
      .findChild(["oarr", "[0]"])
      .addChild(
        new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value1", [
          "comment1"
        ])
      );
    config.default
      .findChild(["oarr", "[0]"])
      .addChild(
        new TreeNode("key2", PROPERTY_VALUE_TYPES.STRING, "value2", [
          "comment2"
        ])
      );
    config.default
      .findChild(["oarr"])
      .addChild(
        new TreeNode("[1]", PROPERTY_VALUE_TYPES.OBJECT, null, ["item1"])
      );
    config.default.findChild(["oarr", "[1]"]).anchor = "oarr-1";
    config.default
      .findChild(["oarr", "[1]"])
      .addChild(
        new TreeNode("key3", PROPERTY_VALUE_TYPES.STRING, "value3", [
          "comment3"
        ])
      );
    config.default
      .findChild(["oarr", "[1]"])
      .addChild(
        new TreeNode("key4", PROPERTY_VALUE_TYPES.STRING, "value4", [
          "comment4"
        ])
      );

    config.environments.addChild(new TreeNode("dev"));

    config.environments
      .findChild(["dev"])
      .addChild(new TreeNode("oarr", PROPERTY_VALUE_TYPES.OBJECT_ARRAY));
    config.environments
      .findChild(["dev", "oarr"])
      .addChild(
        new TreeNode("[0]", PROPERTY_VALUE_TYPES.OBJECT, null, ["devitem0"])
      );
    config.environments.findChild(["dev", "oarr", "[0]"]).aliases = ["oarr-0"];
    config.environments
      .findChild(["dev", "oarr", "[0]"])
      .addChild(
        new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "devvalue1", [
          "devcomment1"
        ])
      );
    config.environments
      .findChild(["dev", "oarr", "[0]"])
      .addChild(
        new TreeNode("key2", PROPERTY_VALUE_TYPES.STRING, "devvalue2", [
          "devcomment2"
        ])
      );
    config.environments
      .findChild(["dev", "oarr"])
      .addChild(new TreeNode("[1]", PROPERTY_VALUE_TYPES.OBJECT));
    config.environments.findChild(["dev", "oarr", "[1]"]).aliases = ["oarr-1"];

    expect(utilService.compileYAML("dev", config)).toEqual(
      `oarr: !!seq  # oarr-comment
  - !!map  # devitem0
    key1: !!str "devvalue1"  # devcomment1
    key2: !!str "devvalue2"  # devcomment2
  - !!map
    key3: !!str "value3"  # comment3
    key4: !!str "value4"  # comment4`
    );
  });

  it("should compile yaml", () => {
    const config = new Configuration();
    config.default.addChild(
      new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", ["comment1"])
    );
    config.default.addChild(
      new TreeNode("key2", PROPERTY_VALUE_TYPES.NUMBER, 10, ["comment2"])
    );
    config.default.addChild(
      new TreeNode("key3", PROPERTY_VALUE_TYPES.BOOLEAN, true)
    );
    config.default.addChild(
      new TreeNode(
        "var3",
        PROPERTY_VALUE_TYPES.STRING,
        `${constructVar("var1")}/${constructVar("var2")}/${constructVar(
          "key3"
        )}`
      )
    );
    config.default.addChild(
      new TreeNode(
        "undefinedVar",
        PROPERTY_VALUE_TYPES.STRING,
        constructVar("var_undefined"),
        ["comment undefined var"]
      )
    );
    config.default.addChild(
      new TreeNode(
        "var2",
        PROPERTY_VALUE_TYPES.STRING,
        `${constructVar("var1")}/${constructVar("key2")}`
      )
    );
    config.default.addChild(
      new TreeNode("var1", PROPERTY_VALUE_TYPES.STRING, constructVar("key1"))
    );

    config.default.addChild(
      new TreeNode("arr1", PROPERTY_VALUE_TYPES.STRING_ARRAY, null, [
        "arr1-comment"
      ])
    );
    config.default
      .findChild(["arr1"])
      .addChild(new TreeNode("[0]", PROPERTY_VALUE_TYPES.STRING, "value1"));
    config.default
      .findChild(["arr1"])
      .addChild(new TreeNode("[1]", PROPERTY_VALUE_TYPES.STRING, "value2"));

    config.default.addChild(
      new TreeNode("arr2", PROPERTY_VALUE_TYPES.NUMBER_ARRAY, null, [
        "arr2-comment"
      ])
    );
    config.default
      .findChild(["arr2"])
      .addChild(new TreeNode("[0]", PROPERTY_VALUE_TYPES.NUMBER, 100));
    config.default
      .findChild(["arr2"])
      .addChild(new TreeNode("[1]", PROPERTY_VALUE_TYPES.NUMBER, 200));

    config.default.addChild(
      new TreeNode("arr3", PROPERTY_VALUE_TYPES.BOOLEAN_ARRAY, null, [
        "arr3-comment"
      ])
    );
    config.default
      .findChild(["arr3"])
      .addChild(new TreeNode("[0]", PROPERTY_VALUE_TYPES.BOOLEAN, true));
    config.default
      .findChild(["arr3"])
      .addChild(new TreeNode("[1]", PROPERTY_VALUE_TYPES.BOOLEAN, false));

    config.default.addChild(
      new TreeNode("obj", PROPERTY_VALUE_TYPES.OBJECT, null, ["obj-comment"])
    );
    config.default
      .findChild(["obj"])
      .addChild(
        new TreeNode(
          "subkey",
          PROPERTY_VALUE_TYPES.STRING,
          constructVar("key1")
        )
      );

    config.default.addChild(
      new TreeNode(
        "envstr",
        PROPERTY_VALUE_TYPES.STRING,
        `${constructVar(percyConfig.envVariableName)}/file.json`
      )
    );

    config.environments.addChild(new TreeNode("dev"));
    config.environments.addChild(new TreeNode("qat"));
    config.environments.addChild(new TreeNode("prod"));

    config.environments
      .findChild(["dev"])
      .addChild(new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "dev-value"));
    config.environments
      .findChild(["dev"])
      .addChild(
        new TreeNode("arr1", PROPERTY_VALUE_TYPES.STRING_ARRAY, null, [
          "dev-arr1-comment"
        ])
      );
    config.environments
      .findChild(["dev", "arr1"])
      .addChild(
        new TreeNode("[0]", PROPERTY_VALUE_TYPES.STRING, "dev-item1-value", [
          "dev-item1-comment"
        ])
      );

    config.environments
      .findChild(["qat"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "dev"));
    config.environments
      .findChild(["qat"])
      .addChild(
        new TreeNode("key2", PROPERTY_VALUE_TYPES.NUMBER, 50, ["qat-comment2"])
      );
    config.environments
      .findChild(["qat"])
      .addChild(
        new TreeNode("arr2", PROPERTY_VALUE_TYPES.NUMBER_ARRAY, null, [
          "dev-arr2-comment"
        ])
      );
    config.environments
      .findChild(["qat", "arr2"])
      .addChild(
        new TreeNode("[0]", PROPERTY_VALUE_TYPES.NUMBER, 1000, [
          "qat-item1-comment"
        ])
      );
    config.environments
      .findChild(["qat", "arr2"])
      .addChild(
        new TreeNode("[1]", PROPERTY_VALUE_TYPES.NUMBER, 2000, [
          "qat-item2-comment"
        ])
      );
    config.environments
      .findChild(["qat", "arr2"])
      .addChild(
        new TreeNode("[2]", PROPERTY_VALUE_TYPES.NUMBER, 3000, [
          "qat-item3-comment"
        ])
      );

    config.environments
      .findChild(["prod"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "qat"));
    config.environments
      .findChild(["prod"])
      .addChild(new TreeNode("key3", PROPERTY_VALUE_TYPES.BOOLEAN, false));
    config.environments
      .findChild(["prod"])
      .addChild(new TreeNode("arr3", PROPERTY_VALUE_TYPES.BOOLEAN_ARRAY));
    config.environments
      .findChild(["prod", "arr3"])
      .addChild(
        new TreeNode("[0]", PROPERTY_VALUE_TYPES.BOOLEAN, false, [
          "prod-item1-comment"
        ])
      );
    config.environments
      .findChild(["prod", "arr3"])
      .addChild(
        new TreeNode("[1]", PROPERTY_VALUE_TYPES.BOOLEAN, true, [
          "prod-item2-comment"
        ])
      );
    config.environments
      .findChild(["prod"])
      .addChild(
        new TreeNode("obj", PROPERTY_VALUE_TYPES.OBJECT, null, [
          "prod-obj-comment"
        ])
      );
    config.environments
      .findChild(["prod", "obj"])
      .addChild(
        new TreeNode(
          "subkey",
          PROPERTY_VALUE_TYPES.STRING,
          `${constructVar("key1")}/${constructVar("key3")}`
        )
      );

    expect(utilService.compileYAML("dev", config)).toEqual(
      `key1: !!str "dev-value"  # comment1
key2: !!int 10  # comment2
key3: !!bool true
var3: !!str "dev-value/dev-value/10/true"
undefinedVar: !!str "${percyConfig.variablePrefix}var_undefined${percyConfig.variableSuffix}"  # comment undefined var
var2: !!str "dev-value/10"
var1: !!str "dev-value"
arr1: !!seq  # dev-arr1-comment
  - !!str "dev-item1-value"  # dev-item1-comment
arr2: !!seq  # arr2-comment
  - !!int 100
  - !!int 200
arr3: !!seq  # arr3-comment
  - !!bool true
  - !!bool false
obj: !!map  # obj-comment
  subkey: !!str "dev-value"
envstr: !!str "dev/file.json"`
    );

    expect(utilService.compileYAML("qat", config)).toEqual(
      `key1: !!str "dev-value"  # comment1
key2: !!int 50  # qat-comment2
key3: !!bool true
var3: !!str "dev-value/dev-value/50/true"
undefinedVar: !!str "${percyConfig.variablePrefix}var_undefined${percyConfig.variableSuffix}"  # comment undefined var
var2: !!str "dev-value/50"
var1: !!str "dev-value"
arr1: !!seq  # dev-arr1-comment
  - !!str "dev-item1-value"  # dev-item1-comment
arr2: !!seq  # dev-arr2-comment
  - !!int 1000  # qat-item1-comment
  - !!int 2000  # qat-item2-comment
  - !!int 3000  # qat-item3-comment
arr3: !!seq  # arr3-comment
  - !!bool true
  - !!bool false
obj: !!map  # obj-comment
  subkey: !!str "dev-value"
envstr: !!str "qat/file.json"`
    );

    expect(utilService.compileYAML("prod", config)).toEqual(
      `key1: !!str "dev-value"  # comment1
key2: !!int 50  # qat-comment2
key3: !!bool false
var3: !!str "dev-value/dev-value/50/false"
undefinedVar: !!str "${percyConfig.variablePrefix}var_undefined${percyConfig.variableSuffix}"  # comment undefined var
var2: !!str "dev-value/50"
var1: !!str "dev-value"
arr1: !!seq  # dev-arr1-comment
  - !!str "dev-item1-value"  # dev-item1-comment
arr2: !!seq  # dev-arr2-comment
  - !!int 1000  # qat-item1-comment
  - !!int 2000  # qat-item2-comment
  - !!int 3000  # qat-item3-comment
arr3: !!seq  # arr3-comment
  - !!bool false  # prod-item1-comment
  - !!bool true  # prod-item2-comment
obj: !!map  # prod-obj-comment
  subkey: !!str "dev-value/false"
envstr: !!str "prod/file.json"`
    );
  });

  it("should encrypt/decrypt", () => {
    const obj = {
      key: "value",
      valid: true,
      time: Date.now()
    };
    const encrypted = utilService.encrypt(JSON.stringify(obj));

    const decrypted = JSON.parse(utilService.decrypt(encrypted));

    expect(decrypted).toEqual(obj);
  });

  it("should convert git error", () => {
    const err: any = new Error();
    err.data = { statusCode: 401 };
    expect(utilService.convertGitError(err).statusCode).toEqual(401);

    err.data = { statusCode: 403 };
    expect(utilService.convertGitError(err).statusCode).toEqual(403);

    err.data = { statusCode: 404 };
    expect(utilService.convertGitError(err).statusCode).toEqual(404);

    err.data = { statusCode: 500 };
    expect(utilService.convertGitError(err).statusCode).toEqual(500);
  });

  it("should get metadata file path", () => {
    expect(utilService.getMetadataPath("folderName")).toEqual(
      `${percyConfig.metaFolder}/folderName.meta`
    );
  });

  it("should get repo folder", () => {
    const { repoName, repoFolder } = utilService.getRepoFolder(TEST_USER);

    expect(repoName).toEqual(TEST_USER.repoName);
    expect(repoFolder).toEqual(TEST_USER.repoFolder);
  });

  it("should highlight variable correctly", () => {
    expect(
      utilService.highlightNodeVariable(
        new TreeNode("key", PROPERTY_VALUE_TYPES.BOOLEAN, true)
      )
    ).toEqual(true);
    expect(
      utilService.highlightNodeVariable(
        new TreeNode("key", PROPERTY_VALUE_TYPES.NUMBER, 10)
      )
    ).toEqual(10);
    expect(
      utilService.highlightNodeVariable(
        new TreeNode("key", PROPERTY_VALUE_TYPES.STRING, "\\aa\"bb\"cc")
      )
    ).toEqual("\\aa&quot;bb&quot;cc");
    expect(
      utilService.highlightNodeVariable(
        new TreeNode("key", PROPERTY_VALUE_TYPES.STRING, "<span></span>")
      )
    ).toEqual("&lt;span&gt;&lt;/span&gt;");

    const $ = cheerio.load("<span></span>");
    const span = $("span");
    span.append($("<span></span>").text(percyConfig.variablePrefix));
    span.append($("<span class=\"yaml-var\"></span>").text("name"));
    span.append($("<span></span>").text(percyConfig.variableSuffix));
    expect(
      utilService.highlightNodeVariable(
        new TreeNode("key", PROPERTY_VALUE_TYPES.STRING, constructVar("name"))
      )
    ).toEqual(span.html());
  });

  it("should get variables config for all environments", () => {
    // const LOOP_ENV_ERROR = "Cylic env inherits detected!";
    const LOOP_VARIABLE_ERROR = "Cyclic variable reference found!";

    const config = new Configuration();
    const nodeKey1 = new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", ["comment1"]);
    config.default.addChild(nodeKey1);

    const nodeKey2 = new TreeNode("key2", PROPERTY_VALUE_TYPES.NUMBER, 10, ["comment2"]);
    config.default.addChild(nodeKey2);

    const nodeKey3 = new TreeNode("key3", PROPERTY_VALUE_TYPES.BOOLEAN, true);
    config.default.addChild(nodeKey3);

    config.default.addChild(
      new TreeNode("keyObject1", PROPERTY_VALUE_TYPES.OBJECT)
    );

    const nodeKey4 = new TreeNode(
      "key4",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("key1")}`
    );
    config.default.addChild(nodeKey4);

    const nodeKeyUndefined = new TreeNode(
      "keyUndefined",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("varUndefined")}`
    );
    config.default.addChild(nodeKeyUndefined);

    const nodeVar3 = new TreeNode(
      "var3",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("var1")}/${constructVar("var2")}/${constructVar(
        "key3"
      )}`
    );
    config.default.addChild(nodeVar3);

    const nodeVar2 = new TreeNode(
      "var2",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("var1")}/${constructVar("key2")}`
    );
    config.default.addChild(nodeVar2);

    const nodeVar1 = new TreeNode("var1", PROPERTY_VALUE_TYPES.STRING, constructVar("var3"));
    config.default.addChild(nodeVar1);

    config.environments.addChild(new TreeNode("dev"));

    const variableConfig = {
      key1: {
        cascadedValue: nodeKey1.value,
        hasError: false,
        referenceNode: nodeKey1
      },
      key2: {
        cascadedValue: nodeKey2.value,
        hasError: false,
        referenceNode: nodeKey2
      },
      key3: {
        cascadedValue: nodeKey3.value,
        hasError: false,
        referenceNode: nodeKey3
      },
      key4: {
        cascadedValue: nodeKey1.value,
        hasError: false,
        referenceNode: nodeKey4
      },
      keyUndefined: {
        cascadedValue: nodeKeyUndefined.value,
        hasError: false,
        referenceNode: nodeKeyUndefined
      },
      var3: {
        cascadedValue: LOOP_VARIABLE_ERROR,
        hasError: true,
        referenceNode: nodeVar3
      },
      var2: {
        cascadedValue: LOOP_VARIABLE_ERROR,
        hasError: true,
        referenceNode: nodeVar2
      },
      var1: {
        cascadedValue: LOOP_VARIABLE_ERROR,
        hasError: true,
        referenceNode: nodeVar1
      }
    };
    expect(utilService.getEnvsVariablesConfig(config))
    .toEqual({
      default: {
        ...variableConfig,
        [percyConfig.envVariableName]: {
          cascadedValue: "default"
        }
      },
      dev: {
        ...variableConfig,
        [percyConfig.envVariableName]: {
          cascadedValue: "dev"
        }
      }
    });
  });

  it("should return string node value config, with variables", () => {
    const LOOP_ENV_INHERIT_ERROR = "Cylic env inherits detected!";
    const LOOP_VARIABLE_ERROR = "Cyclic variable reference found!";

    const config = new Configuration();
    const nodeKey1 = new TreeNode("key1", PROPERTY_VALUE_TYPES.STRING, "value", ["comment1"]);
    config.default.addChild(nodeKey1);

    const nodeKey2 = new TreeNode("key2", PROPERTY_VALUE_TYPES.NUMBER, 10, ["comment2"]);
    config.default.addChild(nodeKey2);

    const nodeKey3 = new TreeNode("key3", PROPERTY_VALUE_TYPES.BOOLEAN, true);
    config.default.addChild(nodeKey3);

    config.default.addChild(
      new TreeNode("keyObject1", PROPERTY_VALUE_TYPES.OBJECT)
    );

    const nodeKey4 = new TreeNode(
      "key4",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("key1")}`
    );
    config.default.addChild(nodeKey4);

    const nodeKeyUndefined = new TreeNode(
      "keyUndefined",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("varUndefined")}`
    );
    config.default.addChild(nodeKeyUndefined);

    const nodeVar3 = new TreeNode(
      "var3",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("var1")}/${constructVar("var2")}/${constructVar(
        "key3"
      )}`
    );
    config.default.addChild(nodeVar3);

    const nodeVar2 = new TreeNode(
      "var2",
      PROPERTY_VALUE_TYPES.STRING,
      `${constructVar("var1")}/${constructVar("key2")}`
    );
    config.default.addChild(nodeVar2);

    const nodeVar1 = new TreeNode("var1", PROPERTY_VALUE_TYPES.STRING, constructVar("var3"));
    config.default.addChild(nodeVar1);

    config.environments.addChild(new TreeNode("dev"));
    config.environments.addChild(new TreeNode("qat"));
    config.environments.addChild(new TreeNode("prod"));

    config.environments
      .findChild(["dev"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "qat"));

    config.environments
      .findChild(["qat"])
      .addChild(new TreeNode("inherits", PROPERTY_VALUE_TYPES.STRING, "dev"));

    config.environments
      .findChild(["prod"])
      .addChild(new TreeNode("var3", PROPERTY_VALUE_TYPES.NUMBER, 1245));

    const nodeKeyTest = new TreeNode(
      "key",
       PROPERTY_VALUE_TYPES.STRING,
       `src/${constructVar("key4")}/path/${constructVar("varUndefined")}/path2//${constructVar("var1")}`
     );
    config.default.addChild(nodeKeyTest);

    const nodeKeyTestDev = new TreeNode(
      "key",
       PROPERTY_VALUE_TYPES.STRING,
       constructVar("var1")
     );
    config.environments.findChild(["dev"]).addChild(nodeKeyTestDev);

    const nodeKeyTestQat = new TreeNode(
      "key",
       PROPERTY_VALUE_TYPES.STRING,
       constructVar("key4")
     );
    config.environments.findChild(["qat"]).addChild(nodeKeyTestQat);

    const nodeKeyTestProd = new TreeNode(
      "key",
       PROPERTY_VALUE_TYPES.STRING,
       `src/${constructVar("key4")}/path/${constructVar("varUndefined")}/path2//${constructVar("var1")}`
     );
    config.environments.findChild(["prod"]).addChild(nodeKeyTestProd);

    const envsVariablesConfig = utilService.getEnvsVariablesConfig(config);

    expect(
      utilService.getNodeValueConfig(
        new TreeNode("key", PROPERTY_VALUE_TYPES.STRING, "\\aa\"bb\"cc"),
        envsVariablesConfig
      )
    ).toEqual([{ text: "\\aa&quot;bb&quot;cc" }]);

    expect(
      utilService.getNodeValueConfig(
        new TreeNode("key", PROPERTY_VALUE_TYPES.STRING, constructVar("varUndefined")),
        envsVariablesConfig
      )
    ).toEqual([
      {
        text: percyConfig.variablePrefix
      },
      {
        text: "varUndefined",
        variableConfig: {
          cascadedValue: "Undefined variable!",
          hasError: true
        }
      },
      {
        text: percyConfig.variableSuffix
      }
    ]);

    expect(utilService.getNodeValueConfig(nodeKeyTest, envsVariablesConfig)).toEqual([
      {
        text: `src/${percyConfig.variablePrefix}`
      },
      {
        text: "key4",
        variableConfig: {
          cascadedValue: nodeKey1.value,
          hasError: false,
          referenceNode: nodeKey4
        }
      },
      {
        text: `${percyConfig.variableSuffix}/path/${percyConfig.variablePrefix}`,
      },
      {
        text: "varUndefined",
        variableConfig: {
          cascadedValue: "Undefined variable!",
          hasError: true
        }
      },
      {
        text: `${percyConfig.variableSuffix}/path2//${percyConfig.variablePrefix}`,
      },
      {
        text: "var1",
        variableConfig: {
          cascadedValue: LOOP_VARIABLE_ERROR,
          hasError: true,
          referenceNode: nodeVar1
        }
      },
      {
        text: percyConfig.variableSuffix
      }
    ]);

    expect(utilService.getNodeValueConfig(nodeKeyTestDev, envsVariablesConfig)).toEqual([
      {
        text: percyConfig.variablePrefix
      },
      {
        text: "var1",
        variableConfig: {
          cascadedValue: LOOP_ENV_INHERIT_ERROR,
          hasError: true
        }
      },
      {
        text: percyConfig.variableSuffix
      }
    ]);

    expect(utilService.getNodeValueConfig(nodeKeyTestQat, envsVariablesConfig)).toEqual([
      {
        text: percyConfig.variablePrefix
      },
      {
        text: "key4",
        variableConfig: {
          cascadedValue: LOOP_ENV_INHERIT_ERROR,
          hasError: true
        }
      },
      {
        text: percyConfig.variableSuffix
      }
    ]);

    expect(utilService.getNodeValueConfig(nodeKeyTestProd, envsVariablesConfig)).toEqual([
      {
        text: `src/${percyConfig.variablePrefix}`
      },
      {
        text: "key4",
        variableConfig: {
          cascadedValue: nodeKey1.value,
          hasError: false,
          referenceNode: nodeKey4
        }
      },
      {
        text: `${percyConfig.variableSuffix}/path/${percyConfig.variablePrefix}`,
      },
      {
        text: "varUndefined",
        variableConfig: {
          cascadedValue: "Undefined variable!",
          hasError: true
        }
      },
      {
        text: `${percyConfig.variableSuffix}/path2//${percyConfig.variablePrefix}`,
      },
      {
        text: "var1",
        variableConfig: {
          cascadedValue: "1245",
          hasError: false,
          referenceNode: nodeVar1
        }
      },
      {
        text: percyConfig.variableSuffix
      }
    ]);
  });
});
