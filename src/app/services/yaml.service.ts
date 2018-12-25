import * as jsYaml from 'js-yaml';
import * as yamlJS from 'yaml-js';
import * as _ from 'lodash';
import * as cheerio from 'cheerio';

import { PROPERTY_VALUE_TYPES, percyConfig, appPercyConfig } from 'config';
import { TreeNode } from 'models/tree-node';
import { Configuration } from 'models/config-file';
import { Injectable } from '@angular/core';


class YamlParser {

  // mapping of type from YAML to JSON
  private typeMap = {
    str: 'string',
    int: 'number',
    float: 'number',
    map: 'object',
    seq: 'array',
    bool: 'boolean',
    null: 'string',
  };

  // The cursor of events
  private cursor = 0;

  // The events from yaml-js parsing
  private events: any[];

  // The lines
  private lines: string[];

  // The anchors
  private anchors: { [key: string]: TreeNode } = {};

  // Root indicator
  private root = true;

  // The flag indicates whether only supports simple array which has same item type
  private simpleArray = true;

  /**
   * Constructor.
   */
  constructor() {
  }

  /**
   * Get event and forward cursor to next.
   * @param forward Flag indicates whether to forward cursor
   */
  private getEvent(forward: boolean = true) {
    const result = this.events[this.cursor];
    if (forward) {
      this.cursor++;
    }
    return result;
  }

  /**
   * Peek event without forwarding cursor.
   */
  private peekEvent() {
    return this.getEvent(false);
  }

  /**
   * Parse yaml.
   * @param yaml The yaml string
   * @param simpleArray The flag indicates whether only supports simple array
   * @returns TreeNode parsed.
   */
  public parse(yaml: string, simpleArray: boolean = true) {
    this.events = yamlJS.parse(yaml);
    this.lines = yaml.split(/\r?\n/);
    this.cursor = 0;
    this.anchors = {};
    this.root = true;
    this.simpleArray = simpleArray;

    // Skip StreamStartEvent and DocumentStartEvent
    this.getEvent();
    this.getEvent();

    return this.parseEvent();
  }

  /**
   * Parse event.
   * @returns TreeNode parsed.
   */
  private parseEvent() {

    const event = this.peekEvent();
    if (event.constructor.name === 'AliasEvent') {
      return this.parseAliasEvent();
    }

    let result: TreeNode;
    if (event.constructor.name === 'ScalarEvent') {
      result = this.parseScalarEvent();
    } else if (event.constructor.name === 'SequenceStartEvent') {
      result = this.parseSequenceEvent();
    } else if (event.constructor.name === 'MappingStartEvent') {
      result = this.parseMappingEvent();
    }

    const anchor = event.anchor;
    if (anchor) {
      if (this.anchors[anchor]) {
        throw new Error(`Found duplicate anchor: ${anchor}`);
      }
      result.anchor = anchor;
      this.anchors[anchor] = result;
    }

    return result;
  }

  /**
   * Parse alias event.
   * @returns TreeNode parsed.
   */
  private parseAliasEvent() {
    const event = this.getEvent();

    const anchor = event.anchor;
    const anchorNode = this.anchors[anchor];
    if (!anchorNode) {
      throw new Error(`Found undefined anchor: ${anchor}`);
    }

    const result = new TreeNode('', anchorNode.valueType);
    result.aliases = [anchor];
    this.parseComment(result, event.start_mark);
    return result;
  }

  /**
   * Parse mapping event.
   * @returns TreeNode parsed.
   */
  private parseMappingEvent() {
    const result = new TreeNode('');
    let event = this.getEvent();
    this.parseComment(result, event.start_mark);

    while (event.constructor.name !== 'MappingEndEvent') {
      const keyNode = this.parseScalarEvent(false);
      const valueNode = this.parseEvent();

      valueNode.key = keyNode.value;

      if (valueNode.key === '<<' && valueNode.aliases) {
        result.aliases = result.aliases || [];
        result.aliases.push(...valueNode.aliases);
      } else {
        result.addChild(valueNode);
      }

      event = this.peekEvent();
    }
    this.getEvent();

    return result;
  }

  /**
   * Parse sequence event.
   * @returns TreeNode parsed.
   */
  private parseSequenceEvent() {
    const result = new TreeNode('', 'array');
    let event = this.getEvent();
    this.parseComment(result, event.start_mark);

    let idx = 0;
    let itemType: string;

    while (event.constructor.name !== 'SequenceEndEvent') {
      const child = this.parseEvent();
      child.key = `[${idx++}]`;

      if (!this.simpleArray) {
        result.addChild(child);
      } else {
        const valueType = child.valueType;

        if (!itemType) {
          itemType = valueType;
        }

        if (itemType !== valueType) {
          console.warn(`Only support array of items with same type, ${itemType} already detected, and got: ${valueType}`);
        } else {
          result.addChild(child);
        }
      }

      event = this.peekEvent();
    }

    if (this.simpleArray) {
      switch (itemType) {
        case PROPERTY_VALUE_TYPES.STRING:
          result.valueType = PROPERTY_VALUE_TYPES.STRING_ARRAY;
          break;
        case PROPERTY_VALUE_TYPES.BOOLEAN:
          result.valueType = PROPERTY_VALUE_TYPES.BOOLEAN_ARRAY;
          break;
        case PROPERTY_VALUE_TYPES.NUMBER:
          result.valueType = PROPERTY_VALUE_TYPES.NUMBER_ARRAY;
          break;
        case PROPERTY_VALUE_TYPES.OBJECT:
          result.valueType = PROPERTY_VALUE_TYPES.OBJECT_ARRAY;
          break;
      }
    }

    this.getEvent();
    return result;
  }

  /**
   * Parse scalar event.
   * @param parseComment Flag indicates whether to parse comment
   * @returns TreeNode parsed.
   */
  private parseScalarEvent(parseComment: boolean = true) {
    const event = this.getEvent();
    const type = this.extractYamlDataType(event.tag) || 'string';
    const result = new TreeNode('', type);

    // Parse number if possible
    if (result.valueType === 'number') {
      result.value = _.toNumber(event.value);
    } else if (result.valueType === 'boolean') {
      result.value = JSON.parse(event.value);
    } else if (result.valueType === 'string') {
      result.value = event.value;
    }

    if (result.valueType === 'array') {
      // This happens for an empty array
      result.valueType = 'string[]';
    }

    if (parseComment) {
      this.parseComment(result, event.end_mark);
    }
    return result;
  }

  /**
   * Extract yaml data type.
   * @param comment The comment to extract
   * @returns extracted comment or undefined if it is not a comment
   */
  private extractYamlDataType(dataType: string) {
    const trimmed = _.trim(dataType);
    // Extract the data type
    const extracted = trimmed.replace(/^tag:yaml.org,2002:/, '');

    // Return extracted data type
    // note if there is more data types need to map then add on mapping of types of YAML and JSON
    return this.typeMap[extracted] ? this.typeMap[extracted] : _.trim(extracted);
  }

  /**
   * Parse comment, will take care root comment.
   * @param node The TreeNode to set comment
   * @param startMark The start mark
   */
  private parseComment(node: TreeNode, startMark: any) {
    if (this.root) {
      // Parse root comment
      let rootComments;
      for (let i = 0; i < startMark.line; i++) {
        const match = this.lines[i].match(/^(\s)*(#.*)/);
        if ((match && match[2]) || _.isEmpty(this.lines[i])) {
          // For root comment, keep it as is
          rootComments = rootComments || [];
          rootComments.push(this.lines[i]);
        }
      }
      node.comment = rootComments;

      this.root = false;
    } else {
      node.comment = this.parseYamlCommentLines(startMark);
    }
  }

  /**
   * Parse yaml comments from multiple lines.
   * @param startMark The start mark
   * @returns parsed comments or undefined if there is not any
   */
  private parseYamlCommentLines(startMark) {

    const comments = [];

    let lineNum = startMark.line;
    const startLine = this.lines[lineNum];
    const inlineComment = this.extractYamlComment(startLine.substring(startMark.column + 1));
    if (_.isString(inlineComment)) {
      comments.push(inlineComment);
    }

    while (lineNum < this.lines.length - 1) {
      ++lineNum;
      if (_.isEmpty(_.trim(this.lines[lineNum]))) {
        continue;
      }
      const match = this.lines[lineNum].match(/^(\s)*(#.*)/);
      if (match && match[2]) {
        const lineComment = this.extractYamlComment(match[2]);
        comments.push(lineComment);
      } else {
        break;
      }
    }

    return comments.length === 0 ? undefined : comments;
  }

  /**
   * Extract yaml comment.
   * @param comment The comment to extract
   * @returns extracted comment or undefined if it is not a comment
   */
  private extractYamlComment(comment: string) {
    const trimmed = _.trim(comment);
    const idx = _.indexOf(trimmed, '#');
    if (!trimmed || idx === -1) {
      // Does not contain '#', it's not a comment, return undefined
      return;
    }
    if (trimmed[idx + 1] === '#') {
      return _.trim(trimmed.substring(idx));
    }
    return _.trim(trimmed.substring(idx + 1));
  }
}

class YamlRender {

  // mapping of type from JSON to YAML
  private typeMapReverse = {
    string: 'str',
    number: 'float',
    object: 'map',
    boolean: 'bool',
    array: 'seq',
  };

  /**
   * Convert TreeNode object to yaml format.
   * @param tree The TreeNode object
   * @returns Yaml format string
   */
  render(tree: TreeNode) {
    if (_.isEmpty(tree.children)) {
      return tree.isArray() ? '[]' : '{}';
    }

    let result = '';

    if (tree.comment) {
      // Add root comments
      _.each(tree.comment, (comment) => {
        if (/^(\s)*(#.*)/.test(comment) || _.isEmpty(comment)) {
          result += comment + '\n';
        }
      });
    }

    result += this.walkTreeNode(tree);
    result = _.trim(result);

    console.log(result);
    try {
      // Validate against safe schema
      jsYaml.safeLoad(result, { strict: true });
    } catch (err) {
      throw err;
    }

    return result;
  }

  /**
   * Render yaml comment.
   * @param comment The comment to render
   * @returns the comment rendered
   */
  private renderYamlComment(comment: string) {
    if (!comment) {
      return '  #';
    }

    if (comment[0] === '#' && comment[1] === '#') {
      // For multiple consecutive '#', like: '###...'
      // return it as is
      return `  ${comment}`;
    }

    return `  # ${comment}`;
  }

  /**
   * Render comments.
   * @param comments Multiple lines of comments
   * @param result The render result
   * @param indent The indent spaces
   * @returns render result
   */
  private renderComments(comments: string[], result: string, indent: string) {

    result += this.renderYamlComment(comments[0]);

    for (let i = 1; i < comments.length; i++) {
      result += '\n' + indent + this.renderYamlComment(comments[i]);
    }
    return result;
  }

  /**
   * Walk TreeNode, convert to yaml format.
   * @param treeNode The TreeNode
   * @param indent The indent spaces
   * @returns Yaml format string
   */
  private walkTreeNode(treeNode: TreeNode, indent: string = '') {

    let result = '';

    _.each(treeNode.children, (child) => {

      if (treeNode.isArray()) {
        result += indent + '-';
      } else {
        result += indent + child.key + ':';
      }

      // Extract comment
      const comment = child.comment;
      const hasComment = child.comment && child.comment.length > 0;

      let type = child.valueType;

      if (child.aliases && child.valueType !== PROPERTY_VALUE_TYPES.OBJECT) {
        result += ` *${child.aliases[0]}`;

        if (hasComment) {
          result = this.renderComments(comment, result, indent);
        }

        result += '\n';
        return;
      }

      if (child.isArray()) {
        result += ' !!seq';
      } else {
        if (type === PROPERTY_VALUE_TYPES.NUMBER && _.isInteger(child.value)) {
          type = 'int';
        } else {
          type = this.typeMapReverse[type];
        }
        result += ' !!' + type;
      }

      if (child.anchor) {
        result += ' &' + child.anchor;
      }

      if (!child.isLeaf()) {

        // Append inline comment and multiple lines comments
        if (hasComment) {
          result = this.renderComments(comment, result, indent);
        }

        if (child.aliases && child.valueType === PROPERTY_VALUE_TYPES.OBJECT) {
          child.aliases.forEach(alias => {
            result += '\n' + indent + '  <<: *' + alias;
          });
        }

        // Recursively walk the children nodes
        const nestResult = this.walkTreeNode(child, indent + '  ');
        result += '\n' + nestResult;
      } else {
        let value = child.value;

        // Append simple value and inline comment
        if (type === 'str') {
          value = value.replace(/\\/g, '\\\\');
          value = value.replace(/\"/g, '\\"');
          result += ' "' + value + '"';
        } else {
          result += ' ' + value;
        }

        if (hasComment) {
          result = this.renderComments(comment, result, indent);
        }

        result += '\n';
      }
    });

    return result;
  }
}

@Injectable({ providedIn: 'root' })
export class YamlService {

  /**
   * Convert yaml to TreeNode object.
   * @param yaml The yaml string
   * @param simpleArray The flag indicates whether only supports simple array
   * @returns TreeNode object
   */
  convertYamlToTree(yaml: string, simpleArray: boolean = true) {
    return new YamlParser().parse(yaml, simpleArray);
  }

  /**
   * Parse yaml to Configuration object.
   * @param yaml The yaml string
   * @param simpleArray The flag indicates whether only supports simple array
   * @returns Configuration object
   */
  parseYamlConfig(yaml: string, simpleArray: boolean = true) {
    return Configuration.fromTreeNode(this.convertYamlToTree(yaml, simpleArray));
  }

  /**
   * Convert TreeNode object to yaml format.
   * @param tree The TreeNode object
   * @returns Yaml format string
   */
  convertTreeToYaml(tree: TreeNode) {
    return new YamlRender().render(tree);
  }

  /**
   * Escape reg exp.
   *
   * @param text the text might contain reg exp to escape
   * @returns escaped text
   */
  escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  /**
   * Create regexp for variable reference based on percy config.
   *
   * @returns regexp for variable reference
   */
  createRegExp() {
    const prefix = _.defaultTo(appPercyConfig.variablePrefix, percyConfig.variablePrefix);
    const suffix = _.defaultTo(appPercyConfig.variableSuffix, percyConfig.variableSuffix);
    const regexPattern = `${this.escapeRegExp(prefix)}(.+?)${this.escapeRegExp(suffix)}`;
    return new RegExp(regexPattern, 'g');
  }

  /**
   * Construct variable reference.
   *
   * @param variable the variable name
   * @returns variable reference
   */
  constructVariable(variable: string) {
    const prefix = _.defaultTo(appPercyConfig.variablePrefix, percyConfig.variablePrefix);
    const suffix = _.defaultTo(appPercyConfig.variableSuffix, percyConfig.variableSuffix);
    return `${prefix}${variable}${suffix}`;
  }

  /**
   * When resolve token variable references, we collect them to detect loop reference.
   * @param referenceLinks the collected reference links
   * @param refFrom the reference from (left side)
   * @param refTo the reference to (right side)
   * @throws Error if loop reference detected
   */
  private addTokenReference(referenceLinks, refFrom, refTo) {
    if (refFrom === refTo) {
      throw new Error('Loop variable reference: ' + [refFrom, refTo].join('->'));
    }

    let added = false;

    _.each(referenceLinks, referenceLink => {
      if (referenceLink[referenceLink.length - 1] !== refFrom) {
        return;
      }

      const idx = referenceLink.indexOf(refTo);
      if (idx > -1) {
        const cyclic = referenceLink.slice(idx);
        cyclic.push(refTo);
        throw new Error('Loop variable reference: ' + cyclic.join('->'));
      }
      referenceLink.push(refTo);
      added = true;
    });

    if (!added) {
      referenceLinks.push([refFrom, refTo]);
    }
  }

  /**
   * Tokens (which are top level properties of default config) can also be variable and reference each other.
   * This method resolves them.
   *
   * @param tokens the tokens to resolves
   * @returns the resolved tokens
   */
  private resolveTokens(tokens) {
    const result = _.cloneDeep(tokens);
    const referenceLinks = [];

    while (true) {
      let referenceFound = false;

      _.each(result, (value, key) => {
        if (typeof value !== 'string') {
          return;
        }

        let retValue = value;

        const regExp = this.createRegExp();
        let regExpResult;

        while (regExpResult = regExp.exec(value)) {

          const fullMatch = regExpResult[0];
          const tokenName = regExpResult[1];
          const tokenValue = result[tokenName];

          if (typeof tokenValue === 'string') {
            if (this.createRegExp().exec(tokenValue)) {
              referenceFound = true;
              this.addTokenReference(referenceLinks, key, tokenName);
              continue;
            }
          }

          retValue = retValue.replace(fullMatch, tokenValue);
        }

        result[key] = retValue;
      });

      if (!referenceFound) {
        break;
      }
    }

    return result;
  }

  /**
   * Yaml config can contain variable reference.
   * This method rescusively substitutes the variable references.
   *
   * @param target the config to substitute
   * @param tokens the tokens (which are top level properties of default config)
   * @param depth the depth of config
   * @returns the substitued config
   */
  private substitute(target: TreeNode, tokens, depth) {
    if (target.valueType === PROPERTY_VALUE_TYPES.OBJECT) {
      _.each(target.children, (child) => {
        if (depth === 0 && child.isLeaf() && _.has(tokens, child.key)) {
          child.value = tokens[child.key];
        } else {
          this.substitute(child, tokens, depth++);
        }
      });
      return target;
    }

    if (target.valueType === PROPERTY_VALUE_TYPES.STRING_ARRAY
      || target.valueType === PROPERTY_VALUE_TYPES.OBJECT_ARRAY
      || target.valueType === 'array') {
      _.each(target.children, (child) => {
        this.substitute(child, tokens, depth++);
      });
      return target;
    }

    if (target.valueType !== PROPERTY_VALUE_TYPES.STRING) {
      return target;
    }

    const text = target.value;
    let retVal = text;

    const regExp = this.createRegExp();
    let regExpResult;
    while (regExpResult = regExp.exec(text)) {
      const fullMatch = regExpResult[0];
      const tokenName = regExpResult[1];
      const tokenValue = tokens[tokenName];

      retVal = retVal.replace(fullMatch, tokenValue);
    }
    target.value = retVal;
    return target;
  }

  /**
   * Environment and inherit another environment.
   * This method merges environment.
   *
   * @param dest the dest environment to merge to
   * @param src the source environment to merge from
   */
  private mergeEnv(dest: TreeNode, src: TreeNode) {
    if (dest.isLeaf()) {
      const match = src.findChild(dest.getPathsWithoutRoot());
      if (match) {
        dest.value = match.value;
        dest.comment = match.comment || dest.comment;
      }
    } else if (dest.isArray()) {
      const match = src.findChild(dest.getPathsWithoutRoot());
      if (match) {
        dest.comment = match.comment || dest.comment;
        // Copy array
        dest.children = [];
        const arr = _.cloneDeep(match.children);
        _.each(arr, item => {
          item.parent = null;
          dest.addChild(item);
        });
      }
    } else {
      dest.comment = src.comment || dest.comment;
      _.each(dest.children, subChild => {
        this.mergeEnv(subChild, src);
      });
    }
  }

  /**
   * Compile yaml for given environment.
   * @param env the environment name
   * @param config the configuration object
   * @returns compiled yaml string
   */
  compileYAML(env: string, config: Configuration) {
    const mergeStack = [];
    const inheritedEnvs = [env];

    let envNode = config.environments.findChild([env]);
    while (envNode) {
      const deepCopy = _.cloneDeep(envNode);
      const inherits = deepCopy.findChild(['inherits']);
      mergeStack.unshift(deepCopy);
      if (inherits) {
        _.remove(deepCopy.children, v => v === inherits);
        const inheritEnv = inherits.value;
        if (inheritedEnvs.indexOf(inheritEnv) > -1) {
          throw new Error('Cylic env inherits detected!');
        }
        inheritedEnvs.push(inheritEnv);
        envNode = config.environments.findChild([inheritEnv]);
      } else {
        break;
      }
    }

    const merged = _.cloneDeep(config.default);
    mergeStack.forEach(m => {
      this.mergeEnv(merged, m);
    });

    let tokens = {};
    _.each(merged.children, (child) => {
      if (child.isLeaf()) {
        tokens[child.key] = child.value;
      }
    });

    tokens = this.resolveTokens(tokens);

    const substituted = this.substitute(merged, tokens, 0);
    substituted.key = env;

    return this.convertTreeToYaml(substituted);
  }

  /**
   * Highlight variable within yaml text string value
   * @param text the yaml text string value
   * @param parentSpan the parent span node contains the text
   * @returns span element with variable highlighted, or given parent span if there is no variable found
   */
  highlightVariable(text: string, parentSpan?: Cheerio) {
    const prefix = _.defaultTo(appPercyConfig.variablePrefix, percyConfig.variablePrefix);

    // Find out the variable token, wrap it in '<span class="yaml-var">${tokenName}</span>'
    let leftIdx = 0;
    let regExpResult;
    let newSpan: Cheerio = null;
    const $ = cheerio.load('');
    const regExp = this.createRegExp();
    while (regExpResult = regExp.exec(text)) {
      if (!newSpan) {
        newSpan = $('<span class="hljs-string"></span>');
      }
      const tokenName = regExpResult[1];

      // Append left side plus variable substitute prefix
      newSpan.append($('<span></span>').text(text.slice(leftIdx, regExpResult.index) + prefix));
      // Append variable token name
      newSpan.append($('<span class="yaml-var"></span>').text(tokenName));
      // Update index
      leftIdx = regExpResult.index + prefix.length + tokenName.length;
    }

    if (newSpan) {
      // Append string left
      newSpan.append($('<span></span>').text(text.slice(leftIdx)));
      return newSpan;
    }
    return parentSpan ? parentSpan : $('<span></span>').text(text);
  }

  /**
   * Highlight variable within yaml text string value in a TreeNode
   * @param node the string TreeNode to highlight its value
   * @returns html rendered with highlighted variable
   */
  highlightNodeVariable(node: TreeNode) {
    if (node.valueType !== PROPERTY_VALUE_TYPES.STRING) {
      return node.value;
    }
    const span = this.highlightVariable(_.defaultTo(node.value, ''));
    return span.html();
  }
}
