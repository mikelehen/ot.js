/*
 *    /\
 *   /  \ ot 0.0.11
 *  /    \ http://operational-transformation.github.com
 *  \    /
 *   \  / (c) 2012-2013 Tim Baumann <tim@timbaumann.info> (http://timbaumann.info)
 *    \/ ot may be freely distributed under the MIT license.
 */

if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.TextOp = (function() {
  function assert(bool) {
    if (!bool) { throw new Error('assertion failed.'); }
  }

  // Operation are essentially lists of ops. There are three types of ops:
  //
  // * Retain ops: Advance the cursor position by a given number of characters.
  //   Represented by positive ints.
  // * Insert ops: Insert a given string at the current cursor position.
  //   Represented by strings.
  // * Delete ops: Delete the next n characters. Represented by negative ints.
  function TextOp(type) {
    this.type = type;
    this.chars = null;
    this.text = null;
    this.attributes = null;

    if (type === 'insert') {
      this.text = arguments[1];
      assert(typeof this.text === 'string');
      this.attributes = arguments[2] || { };
      assert (typeof this.attributes === 'object');
    } else if (type === 'delete') {
      this.chars = arguments[1];
      assert(typeof this.chars === 'number');
    } else if (type === 'retain') {
      this.chars = arguments[1];
      assert(typeof this.chars === 'number');
      this.attributes = arguments[2] || { };
      assert (typeof this.attributes === 'object');
    }
  }

  TextOp.prototype.isInsert = function() { return this.type === 'insert'; };
  TextOp.prototype.isDelete = function() { return this.type === 'delete'; };
  TextOp.prototype.isRetain = function() { return this.type === 'retain'; };

  TextOp.prototype.equals = function(other) {
    return (this.type === other.type &&
        this.text === other.text &&
        this.chars === other.chars &&
        this.attributesEqual(other.attributes));
  };

  TextOp.prototype.attributesEqual = function(otherAttributes) {
    for (var attr in this.attributes) {
      if (this.attributes[attr] !== otherAttributes[attr]) { return false; }
    }

    for (attr in otherAttributes) {
      if (this.attributes[attr] !== otherAttributes[attr]) { return false; }
    }

    return true;
  };

  TextOp.prototype.hasEmptyAttributes = function() {
    var empty = true;
    for (var attr in this.attributes) {
      empty = false;
      break;
    }

    return empty;
  };

  return TextOp;
})();

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.TextOp;
}

if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.TextOperation = (function (global) {
  var TextOp = global.ot ? global.ot.TextOp : require('./text-op');

  // Constructor for new operations.
  function TextOperation () {
    if (this.constructor !== TextOperation) {
      // => function was called without 'new'
      return new TextOperation();
    }

    // When an operation is applied to an input string, you can think of this as
    // if an imaginary cursor runs over the entire string and skips over some
    // parts, deletes some parts and inserts characters at some positions. These
    // actions (skip/delete/insert) are stored as an array in the "ops" property.
    this.ops = [];
    // An operation's baseLength is the length of every string the operation
    // can be applied to.
    this.baseLength = 0;
    // The targetLength is the length of every string that results from applying
    // the operation on a valid input string.
    this.targetLength = 0;
  }

  TextOperation.prototype.equals = function (other) {
    if (this.baseLength !== other.baseLength) { return false; }
    if (this.targetLength !== other.targetLength) { return false; }
    if (this.ops.length !== other.ops.length) { return false; }
    for (var i = 0; i < this.ops.length; i++) {
      if (!this.ops[i].equals(other.ops[i])) { return false; }
    }
    return true;
  };


  // After an operation is constructed, the user of the library can specify the
  // actions of an operation (skip/insert/delete) with these three builder
  // methods. They all return the operation for convenient chaining.

  // Skip over a given number of characters.
  TextOperation.prototype.retain = function (n, attributes) {
    if (typeof n !== 'number' || n < 0) {
      throw new Error("retain expects a positive integer.");
    }
    if (n === 0) { return this; }
    this.baseLength += n;
    this.targetLength += n;
    attributes = attributes || { };
    var prevOp = (this.ops.length > 0) ? this.ops[this.ops.length - 1] : null;
    if (prevOp && prevOp.isRetain() && prevOp.attributesEqual(attributes)) {
      // The last op is a retain op with the same attributes => we can merge them into one op.
      prevOp.chars += n;
    } else {
      // Create a new op.
      this.ops.push(new TextOp('retain', n, attributes));
    }
    return this;
  };

  // Insert a string at the current position.
  TextOperation.prototype.insert = function (str, attributes) {
    if (typeof str !== 'string') {
      throw new Error("insert expects a string");
    }
    if (str === '') { return this; }
    attributes = attributes || { };
    this.targetLength += str.length;
    var prevOp = (this.ops.length > 0) ? this.ops[this.ops.length - 1] : null;
    var prevPrevOp = (this.ops.length > 1) ? this.ops[this.ops.length - 2] : null;
    if (prevOp && prevOp.isInsert() && prevOp.attributesEqual(attributes)) {
      // Merge insert op.
      prevOp.text += str;
    } else if (prevOp && prevOp.isDelete()) {
      // It doesn't matter when an operation is applied whether the operation
      // is delete(3), insert("something") or insert("something"), delete(3).
      // Here we enforce that in this case, the insert op always comes first.
      // This makes all operations that have the same effect when applied to
      // a document of the right length equal in respect to the `equals` method.
      if (prevPrevOp && prevPrevOp.isInsert() && prevPrevOp.attributesEqual(attributes)) {
        prevPrevOp.text += str;
      } else {
        this.ops[this.ops.length - 1] = new TextOp('insert', str, attributes);
        this.ops.push(prevOp);
      }
    } else {
      this.ops.push(new TextOp('insert', str, attributes));
    }
    return this;
  };

  // Delete a string at the current position.
  TextOperation.prototype['delete'] = function (n) {
    if (typeof n === 'string') { n = n.length; }
    if (typeof n !== 'number' || n < 0) {
      throw new Error("delete expects a positive integer or a string");
    }
    if (n === 0) { return this; }
    this.baseLength += n;
    var prevOp = (this.ops.length > 0) ? this.ops[this.ops.length - 1] : null;
    if (prevOp && prevOp.isDelete()) {
      prevOp.chars += n;
    } else {
      this.ops.push(new TextOp('delete', n));
    }
    return this;
  };

  // Tests whether this operation has no effect.
  TextOperation.prototype.isNoop = function () {
    return this.ops.length === 0 ||
        (this.ops.length === 1 && (this.ops[0].isRetain() && this.ops[0].hasEmptyAttributes()));
  };

  TextOperation.prototype.clone = function() {
    var clone = new TextOperation();
    for(var i = 0; i < this.ops.length; i++) {
      if (this.ops[i].isRetain()) {
        clone.retain(this.ops[i].chars, this.ops[i].attributes);
      } else if (this.ops[i].isInsert()) {
        clone.insert(this.ops[i].text, this.ops[i].attributes);
      } else {
        clone['delete'](this.ops[i].chars);
      }
    }

    return clone;
  };

  // Pretty printing.
  TextOperation.prototype.toString = function () {
    // map: build a new array by applying a function to every element in an old
    // array.
    var map = Array.prototype.map || function (fn) {
      var arr = this;
      var newArr = [];
      for (var i = 0, l = arr.length; i < l; i++) {
        newArr[i] = fn(arr[i]);
      }
      return newArr;
    };
    return map.call(this.ops, function (op) {
      if (op.isRetain()) {
        return "retain " + op.chars;
      } else if (op.isInsert()) {
        return "insert '" + op.text + "'";
      } else {
        return "delete " + (op.chars);
      }
    }).join(', ');
  };

  // Converts operation into a JSON value.
  TextOperation.prototype.toJSON = function () {
    var ops = [];
    for(var i = 0; i < this.ops.length; i++) {
      // We prefix ops with their attributes if non-empty.
      if (!this.ops[i].hasEmptyAttributes()) {
        ops.push(this.ops[i].attributes);
      }
      if (this.ops[i].type === 'retain') {
        ops.push(this.ops[i].chars);
      } else if (this.ops[i].type === 'insert') {
        ops.push(this.ops[i].text);
      } else if (this.ops[i].type === 'delete') {
        ops.push(-this.ops[i].chars);
      }
    }
    // Return an array with /something/ in it, since an empty array will be treated as null by Firebase.
    if (ops.length === 0) {
      ops.push(0);
    }
    return ops;
  };

  // Converts a plain JS object into an operation and validates it.
  TextOperation.fromJSON = function (ops) {
    var o = new TextOperation();
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      var attributes = { };
      if (typeof op === 'object') {
        attributes = op;
        i++;
        op = ops[i];
      }
      if (typeof op === 'number') {
        if (op > 0) {
          o.retain(op, attributes);
        } else {
          o['delete'](-op);
        }
      } else {
        o.insert(op, attributes);
      }
    }
    return o;
  };

  // Apply an operation to a string, returning a new string. Throws an error if
  // there's a mismatch between the input string and the operation.
  TextOperation.prototype.apply = function (str, oldAttributes, newAttributes) {
    var operation = this;
    oldAttributes = oldAttributes || [];
    newAttributes = newAttributes || [];
    if (str.length !== operation.baseLength) {
      throw new Error("The operation's base length must be equal to the string's length.");
    }
    var newStringParts = [], j = 0, k, attr;
    var oldIndex = 0;
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.isRetain()) {
        if (oldIndex + op.chars > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        // Copy skipped part of the retained string.
        newStringParts[j++] = str.slice(oldIndex, oldIndex + op.chars);

        // Copy (and potentially update) attributes for each char in retained string.
        for(k = 0; k < op.chars; k++) {
          var currAttributes = oldAttributes[oldIndex + k] || { }, updatedAttributes = { };
          for(attr in currAttributes) {
            updatedAttributes[attr] = currAttributes[attr];
          }
          for(attr in op.attributes) {
            if (op.attributes[attr] === false) {
              delete updatedAttributes[attr];
            } else {
              updatedAttributes[attr] = op.attributes[attr];
            }
          }
          newAttributes.push(updatedAttributes);
        }

        oldIndex += op.chars;
      } else if (op.isInsert()) {
        // Insert string.
        newStringParts[j++] = op.text;

        // Insert attributes for each char.
        for(k = 0; k < op.text.length; k++) {
          var insertedAttributes = { };
          for(attr in op.attributes) {
            insertedAttributes[attr] = op.attributes[attr];
          }
          newAttributes.push(insertedAttributes);
        }
      } else { // delete op
        oldIndex += op.chars;
      }
    }
    if (oldIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    var newString = newStringParts.join('');

    return newString;
  };

  // Computes the inverse of an operation. The inverse of an operation is the
  // operation that reverts the effects of the operation, e.g. when you have an
  // operation 'insert("hello "); skip(6);' then the inverse is 'delete("hello ");
  // skip(6);'. The inverse should be used for implementing undo.
  TextOperation.prototype.invert = function (str) {
    var strIndex = 0;
    var inverse = new TextOperation();
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.isRetain()) {
        inverse.retain(op.chars);
        strIndex += op.chars;
      } else if (op.isInsert()) {
        inverse['delete'](op.text.length);
      } else { // delete op
        inverse.insert(str.slice(strIndex, strIndex + op.chars));
        strIndex += op.chars;
      }
    }
    return inverse;
  };

  // Compose merges two consecutive operations into one operation, that
  // preserves the changes of both. Or, in other words, for each input string S
  // and a pair of consecutive operations A and B,
  // apply(apply(S, A), B) = apply(S, compose(A, B)) must hold.
  TextOperation.prototype.compose = function (operation2) {
    var operation1 = this;
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error("The base length of the second operation has to be the target length of the first operation");
    }

    function composeAttributes(first, second, firstOpIsInsert) {
      var merged = { }, attr;
      for(attr in first) {
        merged[attr] = first[attr];
      }
      for(attr in second) {
        if (firstOpIsInsert && second[attr] === false) {
          delete merged[attr];
        } else {
          merged[attr] = second[attr];
        }
      }
      return merged;
    }

    var operation = new TextOperation(); // the combined operation
    var ops1 = operation1.clone().ops, ops2 = operation2.clone().ops;
    var i1 = 0, i2 = 0; // current index into ops1 respectively ops2
    var op1 = ops1[i1++], op2 = ops2[i2++]; // current ops
    var attributes;
    while (true) {
      // Dispatch on the type of op1 and op2
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      if (op1 && op1.isDelete()) {
        operation['delete'](op1.chars);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.isInsert()) {
        operation.insert(op2.text, op2.attributes);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === 'undefined') {
        throw new Error("Cannot compose operations: first operation is too short.");
      }
      if (typeof op2 === 'undefined') {
        throw new Error("Cannot compose operations: fist operation is too long.");
      }

      if (op1.isRetain() && op2.isRetain()) {
        attributes = composeAttributes(op1.attributes, op2.attributes);
        if (op1.chars > op2.chars) {
          operation.retain(op2.chars, attributes);
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          operation.retain(op1.chars, attributes);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.retain(op1.chars, attributes);
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
      } else if (op1.isInsert() && op2.isDelete()) {
        if (op1.text.length > op2.chars) {
          op1.text = op1.text.slice(op2.chars);
          op2 = ops2[i2++];
        } else if (op1.text.length === op2.chars) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2.chars -= op1.text.length;
          op1 = ops1[i1++];
        }
      } else if (op1.isInsert() && op2.isRetain()) {
        attributes = composeAttributes(op1.attributes, op2.attributes, /*firstOpIsInsert=*/true);
        if (op1.text.length > op2.chars) {
          operation.insert(op1.text.slice(0, op2.chars), attributes);
          op1.text = op1.text.slice(op2.chars);
          op2 = ops2[i2++];
        } else if (op1.text.length === op2.chars) {
          operation.insert(op1.text, attributes);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.insert(op1.text, attributes);
          op2.chars -= op1.text.length;
          op1 = ops1[i1++];
        }
      } else if (op1.isRetain() && op2.isDelete()) {
        if (op1.chars > op2.chars) {
          operation['delete'](op2.chars);
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          operation['delete'](op2.chars);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation['delete'](op1.chars);
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
      } else {
        throw new Error(
          "This shouldn't happen: op1: " +
          JSON.stringify(op1) + ", op2: " +
          JSON.stringify(op2)
        );
      }
    }
    return operation;
  };

  // When you use ctrl-z to undo your latest changes, you expect the program not
  // to undo every single keystroke but to undo your last sentence you wrote at
  // a stretch or the deletion you did by holding the backspace key down. This
  // This can be implemented by composing operations on the undo stack. This
  // method can help decide whether two operations should be composed. It
  // returns true if the operations are consecutive insert operations or both
  // operations delete text at the same position. You may want to include other
  // factors like the time since the last change in your decision.
  TextOperation.prototype.shouldBeComposedWith = function (other) {
    function getSimpleOp (operation) {
      var ops = operation.ops;
      switch (ops.length) {
      case 1:
        return ops[0];
      case 2:
        return ops[0].isRetain() ? ops[1] : (ops[1].isRetain() ? ops[0] : null);
      case 3:
        if (ops[0].isRetain() && ops[2].isRetain()) { return ops[1]; }
      }
      return null;
    }

    function getStartIndex (operation) {
      if (operation.ops[0].isRetain()) { return operation.ops[0].chars; }
      return 0;
    }

    if (this.isNoop() || other.isNoop()) { return true; }

    var startA = getStartIndex(this), startB = getStartIndex(other);
    var simpleA = getSimpleOp(this), simpleB = getSimpleOp(other);
    if (!simpleA || !simpleB) { return false; }

    if (simpleA.isInsert() && simpleB.isInsert()) {
      return startA + simpleA.text.length === startB;
    }

    if (simpleA.isDelete() && simpleB.isDelete()) {
      // there are two possibilities to delete: with backspace and with the
      // delete key.
      return (startB + simpleB.chars === startA) || startA === startB;
    }

    return false;
  };

  TextOperation.transformAttributes = function(attributes1, attributes2) {
    var attributes1prime = { }, attributes2prime = { };
    var attr, allAttrs = { };
    for(attr in attributes1) { allAttrs[attr] = true; }
    for(attr in attributes2) { allAttrs[attr] = true; }

    for (attr in allAttrs) {
      var attr1 = attributes1[attr], attr2 = attributes2[attr];
      if (attr1 == null) {
        // Only modified by attributes2; keep it.
        attributes2prime[attr] = attr2;
      } else if (attr2 == null) {
        // only modified by attributes1; keep it
        attributes1prime[attr] = attr1;
      } else if (attr1 === attr2) {
        // Both set it to the same value.  Nothing to do.
      } else {
        // attr1 and attr2 are different. Prefer attr1.
        attributes1prime[attr] = attr1;
      }
    }
    return [attributes1prime, attributes2prime];
  };

  // Transform takes two operations A and B that happened concurrently and
  // produces two operations A' and B' (in an arry) such that
  // apply(apply(S, A), B') = apply(apply(S, B), A'). This function is the heart
  // of OT.
  TextOperation.transform = function (operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }

    var operation1prime = new TextOperation();
    var operation2prime = new TextOperation();
    var ops1 = operation1.clone().ops, ops2 = operation2.clone().ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      // At every iteration of the loop, the imaginary cursor that both
      // operation1 and operation2 have that operates on the input string must
      // have the same position in the input string.

      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      // next two cases: one or both ops are insert ops
      // => insert the string in the corresponding prime operation, skip it in
      // the other one. If both op1 and op2 are insert ops, prefer op1.
      if (op1 && op1.isInsert()) {
        operation1prime.insert(op1.text, op1.attributes);
        operation2prime.retain(op1.text.length);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.isInsert()) {
        operation1prime.retain(op2.text.length);
        operation2prime.insert(op2.text, op2.attributes);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === 'undefined') {
        throw new Error("Cannot transform operations: first operation is too short.");
      }
      if (typeof op2 === 'undefined') {
        throw new Error("Cannot transform operations: first operation is too long.");
      }

      var minl;
      if (op1.isRetain() && op2.isRetain()) {
        // Simple case: retain/retain
        var attributesPrime = TextOperation.transformAttributes(op1.attributes, op2.attributes);
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op2.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }

        operation1prime.retain(minl, attributesPrime[0]);
        operation2prime.retain(minl, attributesPrime[1]);
      } else if (op1.isDelete() && op2.isDelete()) {
        // Both operations delete the same string at the same position. We don't
        // need to produce any operations, we just skip over the delete ops and
        // handle the case that one operation deletes more than the other.
        if (op1.chars > op2.chars) {
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
      // next two cases: delete/retain and retain/delete
      } else if (op1.isDelete() && op2.isRetain()) {
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op2.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
        operation1prime['delete'](minl);
      } else if (op1.isRetain() && op2.isDelete()) {
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op1.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
        operation2prime['delete'](minl);
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }

    return [operation1prime, operation2prime];
  };

  return TextOperation;
}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.TextOperation;
}

if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.Cursor = (function (global) {

  var TextOperation = global.ot ? global.ot.TextOperation : require('./text-operation');

  // A cursor has a `position` and a `selectionEnd`. Both are zero-based indexes
  // into the document. When nothing is selected, `selectionEnd` is equal to
  // `position`. When there is a selection, `position` is always the side of the
  // selection that would move if you pressed an arrow key.
  function Cursor (position, selectionEnd) {
    this.position = position;
    this.selectionEnd = selectionEnd;
  }

  Cursor.fromJSON = function (obj) {
    return new Cursor(obj.position, obj.selectionEnd);
  };

  Cursor.prototype.equals = function (other) {
    return this.position === other.position &&
      this.selectionEnd === other.selectionEnd;
  };

  // Return the more current cursor information.
  Cursor.prototype.compose = function (other) {
    return other;
  };

  // Update the cursor with respect to an operation.
  Cursor.prototype.transform = function (other) {
    function transformIndex (index) {
      var newIndex = index;
      var ops = other.ops;
      for (var i = 0, l = other.ops.length; i < l; i++) {
        if (ops[i].isRetain()) {
          index -= ops[i].chars;
        } else if (ops[i].isInsert()) {
          newIndex += ops[i].text.length;
        } else {
          newIndex -= Math.min(index, ops[i].chars);
          index -= ops[i].chars;
        }
        if (index < 0) { break; }
      }
      return newIndex;
    }

    var newPosition = transformIndex(this.position);
    if (this.position === this.selectionEnd) {
      return new Cursor(newPosition, newPosition);
    }
    return new Cursor(newPosition, transformIndex(this.selectionEnd));
  };

  return Cursor;

}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.Cursor;
}

if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.WrappedOperation = (function (global) {

  // A WrappedOperation contains an operation and corresponing metadata.
  function WrappedOperation (operation, meta) {
    this.wrapped = operation;
    this.meta    = meta;
  }

  WrappedOperation.prototype.apply = function () {
    return this.wrapped.apply.apply(this.wrapped, arguments);
  };

  WrappedOperation.prototype.invert = function () {
    var meta = this.meta;
    return new WrappedOperation(
      this.wrapped.invert.apply(this.wrapped, arguments),
      meta && typeof meta === 'object' && typeof meta.invert === 'function' ?
        meta.invert.apply(meta, arguments) : meta
    );
  };

  // Copy all properties from source to target.
  function copy (source, target) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }

  function composeMeta (a, b) {
    if (a && typeof a === 'object') {
      if (typeof a.compose === 'function') { return a.compose(b); }
      var meta = {};
      copy(a, meta);
      copy(b, meta);
      return meta;
    }
    return b;
  }

  WrappedOperation.prototype.compose = function (other) {
    return new WrappedOperation(
      this.wrapped.compose(other.wrapped),
      composeMeta(this.meta, other.meta)
    );
  };

  function transformMeta (meta, operation) {
    if (meta && typeof meta === 'object') {
      if (typeof meta.transform === 'function') {
        return meta.transform(operation);
      }
    }
    return meta;
  }

  WrappedOperation.transform = function (a, b) {
    var transform = a.wrapped.constructor.transform;
    var pair = transform(a.wrapped, b.wrapped);
    return [
      new WrappedOperation(pair[0], transformMeta(a.meta, b.wrapped)),
      new WrappedOperation(pair[1], transformMeta(b.meta, a.wrapped))
    ];
  };

  return WrappedOperation;

}(this));

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.WrappedOperation;
}
if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.UndoManager = (function () {

  var NORMAL_STATE = 'normal';
  var UNDOING_STATE = 'undoing';
  var REDOING_STATE = 'redoing';

  // Create a new UndoManager with an optional maximum history size.
  function UndoManager (maxItems) {
    this.maxItems  = maxItems || 50;
    this.state = NORMAL_STATE;
    this.dontCompose = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  // Add an operation to the undo or redo stack, depending on the current state
  // of the UndoManager. The operation added must be the inverse of the last
  // edit. When `compose` is true, compose the operation with the last operation
  // unless the last operation was alread pushed on the redo stack or was hidden
  // by a newer operation on the undo stack.
  UndoManager.prototype.add = function (operation, compose) {
    if (this.state === UNDOING_STATE) {
      this.redoStack.push(operation);
      this.dontCompose = true;
    } else if (this.state === REDOING_STATE) {
      this.undoStack.push(operation);
      this.dontCompose = true;
    } else {
      var undoStack = this.undoStack;
      if (!this.dontCompose && compose && undoStack.length > 0) {
        undoStack.push(operation.compose(undoStack.pop()));
      } else {
        undoStack.push(operation);
        if (undoStack.length > this.maxItems) { undoStack.shift(); }
      }
      this.dontCompose = false;
      this.redoStack = [];
    }
  };

  function transformStack (stack, operation) {
    var newStack = [];
    var Operation = operation.constructor;
    for (var i = stack.length - 1; i >= 0; i--) {
      var pair = Operation.transform(stack[i], operation);
      if (typeof pair[0].isNoop !== 'function' || !pair[0].isNoop()) {
        newStack.push(pair[0]);
      }
      operation = pair[1];
    }
    return newStack.reverse();
  }

  // Transform the undo and redo stacks against a operation by another client.
  UndoManager.prototype.transform = function (operation) {
    this.undoStack = transformStack(this.undoStack, operation);
    this.redoStack = transformStack(this.redoStack, operation);
  };

  // Perform an undo by calling a function with the latest operation on the undo
  // stack. The function is expected to call the `add` method with the inverse
  // of the operation, which pushes the inverse on the redo stack.
  UndoManager.prototype.performUndo = function (fn) {
    this.state = UNDOING_STATE;
    if (this.undoStack.length === 0) { throw new Error("undo not possible"); }
    fn(this.undoStack.pop());
    this.state = NORMAL_STATE;
  };

  // The inverse of `performUndo`.
  UndoManager.prototype.performRedo = function (fn) {
    this.state = REDOING_STATE;
    if (this.redoStack.length === 0) { throw new Error("redo not possible"); }
    fn(this.redoStack.pop());
    this.state = NORMAL_STATE;
  };

  // Is the undo stack not empty?
  UndoManager.prototype.canUndo = function () {
    return this.undoStack.length !== 0;
  };

  // Is the redo stack not empty?
  UndoManager.prototype.canRedo = function () {
    return this.redoStack.length !== 0;
  };

  // Whether the UndoManager is currently performing an undo.
  UndoManager.prototype.isUndoing = function () {
    return this.state === UNDOING_STATE;
  };

  // Whether the UndoManager is currently performing a redo.
  UndoManager.prototype.isRedoing = function () {
    return this.state === REDOING_STATE;
  };

  return UndoManager;

}());

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.UndoManager;
}

// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Client = (function (global) {

  // Client constructor
  function Client (revision) {
    this.revision = revision; // the next expected revision number
    this.state = synchronized; // start state
  }

  Client.prototype.setState = function (state) {
    this.state = state;
  };

  // Call this method when the user changes the document.
  Client.prototype.applyClient = function (operation) {
    this.setState(this.state.applyClient(this, operation));
  };

  // Call this method with a new operation from the server
  Client.prototype.applyServer = function (operation) {
    this.revision++;
    this.setState(this.state.applyServer(this, operation));
  };

  Client.prototype.serverAck = function () {
    this.revision++;
    this.setState(this.state.serverAck(this));
  };
  
  Client.prototype.serverReconnect = function () {
    if (typeof this.state.resend === 'function') { this.state.resend(this); }
  };

  // Transforms a cursor position from the latest known server state to the
  // current client state. For example, if we get from the server the
  // information that another user's cursor is at position 3, but the server
  // hasn't yet received our newest operation, an insertion of 5 characters at
  // the beginning of the document, the correct position of the other user's
  // cursor in our current document is 8.
  Client.prototype.transformCursor = function (cursor) {
    return this.state.transformCursor(cursor);
  };

  // Override this method.
  Client.prototype.sendOperation = function (revision, operation) {
    throw new Error("sendOperation must be defined in child class");
  };

  // Override this method.
  Client.prototype.applyOperation = function (operation) {
    throw new Error("applyOperation must be defined in child class");
  };


  // In the 'Synchronized' state, there is no pending operation that the client
  // has sent to the server.
  function Synchronized () {}
  Client.Synchronized = Synchronized;

  Synchronized.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'AwaitingConfirm' state
    client.sendOperation(client.revision, operation);
    return new AwaitingConfirm(operation);
  };

  Synchronized.prototype.applyServer = function (client, operation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  };

  Synchronized.prototype.serverAck = function (client) {
    throw new Error("There is no pending operation.");
  };

  // Nothing to do because the latest server state and client state are the same.
  Synchronized.prototype.transformCursor = function (cursor) { return cursor; };

  // Singleton
  var synchronized = new Synchronized();


  // In the 'AwaitingConfirm' state, there's one operation the client has sent
  // to the server and is still waiting for an acknowledgement.
  function AwaitingConfirm (outstanding) {
    // Save the pending operation
    this.outstanding = outstanding;
  }
  Client.AwaitingConfirm = AwaitingConfirm;

  AwaitingConfirm.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'AwaitingWithBuffer' state
    return new AwaitingWithBuffer(this.outstanding, operation);
  };

  AwaitingConfirm.prototype.applyServer = function (client, operation) {
    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    var pair = operation.constructor.transform(this.outstanding, operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  };

  AwaitingConfirm.prototype.serverAck = function (client) {
    // The client's operation has been acknowledged
    // => switch to synchronized state
    return synchronized;
  };

  AwaitingConfirm.prototype.transformCursor = function (cursor) {
    return cursor.transform(this.outstanding);
  };

  AwaitingConfirm.prototype.resend = function (client) {
    // The confirm didn't come because the client was disconnected.
    // Now that it has reconnected, we resend the outstanding operation.
    client.sendOperation(client.revision, this.outstanding);
  };


  // In the 'AwaitingWithBuffer' state, the client is waiting for an operation
  // to be acknowledged by the server while buffering the edits the user makes
  function AwaitingWithBuffer (outstanding, buffer) {
    // Save the pending operation and the user's edits since then
    this.outstanding = outstanding;
    this.buffer = buffer;
  }
  Client.AwaitingWithBuffer = AwaitingWithBuffer;

  AwaitingWithBuffer.prototype.applyClient = function (client, operation) {
    // Compose the user's changes onto the buffer
    var newBuffer = this.buffer.compose(operation);
    return new AwaitingWithBuffer(this.outstanding, newBuffer);
  };

  AwaitingWithBuffer.prototype.applyServer = function (client, operation) {
    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    var transform = operation.constructor.transform;
    var pair1 = transform(this.outstanding, operation);
    var pair2 = transform(this.buffer, pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  };

  AwaitingWithBuffer.prototype.serverAck = function (client) {
    // The pending operation has been acknowledged
    // => send buffer
    client.sendOperation(client.revision, this.buffer);
    return new AwaitingConfirm(this.buffer);
  };

  AwaitingWithBuffer.prototype.transformCursor = function (cursor) {
    return cursor.transform(this.outstanding).transform(this.buffer);
  };

  AwaitingWithBuffer.prototype.resend = function (client) {
    // The confirm didn't come because the client was disconnected.
    // Now that it has reconnected, we resend the outstanding operation.
    client.sendOperation(client.revision, this.outstanding);
  };


  return Client;

}(this));

if (typeof module === 'object') {
  module.exports = ot.Client;
}

/*global ot */

ot.CodeMirrorAdapter = (function () {
  var TextOperation = ot.TextOperation;
  var Cursor = ot.Cursor;

  function CodeMirrorAdapter (cm) {
    this.cm = cm;
    this.ignoreNextChange = false;
    this.oldValue = this.cm.getValue();

    bind(this, 'onChange');
    bind(this, 'onCursorActivity');
    bind(this, 'onFocus');
    bind(this, 'onBlur');
    cm.on('change', this.onChange);
    cm.on('cursorActivity', this.onCursorActivity);
    cm.on('focus', this.onFocus);
    cm.on('blur', this.onBlur);
  }

  // Removes all event listeners from the CodeMirror instance.
  CodeMirrorAdapter.prototype.detach = function () {
    this.cm.off('change', this.onChange);
    this.cm.off('cursorActivity', this.onCursorActivity);
    this.cm.off('focus', this.onFocus);
    this.cm.off('blur', this.onBlur);
  };

  // The oldValue is needed to find
  CodeMirrorAdapter.operationFromCodeMirrorChange = function (change, oldValue) {
    var operation = new TextOperation();
    // Holds the current value
    var lines = oldValue.split('\n');

    // Given a { line, ch } object, return the index into the string represented
    // by the current lines object.
    function indexFromPos (pos) {
      var line = pos.line, ch = pos.ch;
      var index = 0;
      for (var i = 0; i < pos.line; i++) {
        index += lines[i].length + 1;
      }
      index += ch;
      return index;
    }

    // The number of characters in the current lines array + number of newlines.
    function getLength () {
      var length = 0;
      for (var i = 0, l = lines.length; i < l; i++) {
        length += lines[i].length;
      }
      return length + lines.length - 1; // include '\n's
    }

    // Returns the substring of the current lines array in the range given by
    // 'from' and 'to' which must be { line, ch } objects
    function getRange (from, to) {
      // Precondition: to ">" from
      if (from.line === to.line) {
        return lines[from.line].slice(from.ch, to.ch);
      }
      var str = lines[from.line].slice(from.ch) + '\n';
      for (var i = from.line + 1; i < to.line; i++) {
        str += lines[i] + '\n';
      }
      str += lines[to.line].slice(0, to.ch);
      return str;
    }

    // Replace the range defined by 'from' and 'to' by 'text' (array of lines).
    // Alters the lines array.
    function replaceRange (text, from, to) {
      // Precondition: to ">" from
      var strLines = text.slice(0); // copy
      var pre = lines[from.line].slice(0, from.ch);
      var post = lines[to.line].slice(to.ch);
      strLines[0] = pre + strLines[0];
      strLines[strLines.length-1] += post;

      strLines.unshift(to.line - from.line + 1); // 2nd positional parameter
      strLines.unshift(from.line); // 1st positional parameter
      lines.splice.apply(lines, strLines);
    }

    // Convert a single CodeMirror change to an operation. Assumes that lines
    // represents the state of the document before the CodeMirror change took
    // place. Alters the lines array so that it represents the document's
    // content after the change.
    function generateOperation (operation, change) {
      var from   = indexFromPos(change.from);
      var to     = indexFromPos(change.to);
      var length = getLength();
      operation.retain(from);
      operation['delete'](getRange(change.from, change.to));
      operation.insert(change.text.join('\n'));
      operation.retain(length - to);
      replaceRange(change.text, change.from, change.to);
    }

    // Convert the first element of the linked list of changes to an operation.
    generateOperation(operation, change);
    //oldValue = operation.apply(oldValue);
    //assert(oldValue === lines.join('\n'));

    // handle lists of operations by doing a left-fold over the linked list,
    // convert each change to an operation and composing it.
    while (true) {
      //assert(operation.targetLength === getLength());
      change = change.next;
      if (!change) { break; }
      var nextOperation = new TextOperation(operation.revision + 1);
      generateOperation(nextOperation, change);
      //oldValue = nextOperation.apply(oldValue);
      //assert(oldValue === lines.join('\n'));
      operation = operation.compose(nextOperation);
    }

    return operation;
  };

  // Apply an operation to a CodeMirror instance.
  CodeMirrorAdapter.applyOperationToCodeMirror = function (operation, cm) {
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0; // holds the current index into CodeMirror's content
      for (var i = 0, l = ops.length; i < l; i++) {
        var op = ops[i];
        if (op.isRetain()) {
          index += op.chars;
        } else if (op.isInsert()) {
          cm.replaceRange(op.text, cm.posFromIndex(index));
          index += op.text.length;
        } else if (op.isDelete()) {
          var from = cm.posFromIndex(index);
          var to   = cm.posFromIndex(index + op.chars);
          cm.replaceRange('', from, to);
        }
      }
      // Check that the operation spans the whole content
      assert(index === cm.getValue().length);
    });
  };

  CodeMirrorAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  CodeMirrorAdapter.prototype.onChange = function (_, change) {
    if (!this.ignoreNextChange) {
      var operation = CodeMirrorAdapter.operationFromCodeMirrorChange(change, this.oldValue);
      this.trigger('change', this.oldValue, operation);
    }
    this.ignoreNextChange = false;
    this.oldValue = this.cm.getValue();
  };

  CodeMirrorAdapter.prototype.onCursorActivity =
  CodeMirrorAdapter.prototype.onFocus = function () {
    this.trigger('cursorActivity');
  };

  CodeMirrorAdapter.prototype.onBlur = function () {
    if (!this.cm.somethingSelected()) { this.trigger('blur'); }
  };

  CodeMirrorAdapter.prototype.getValue = function () {
    return this.oldValue;
  };

  CodeMirrorAdapter.prototype.getCursor = function () {
    function eqPos (a, b) { return a.line === b.line && a.ch === b.ch; }

    var cm = this.cm;
    var cursorPos = cm.getCursor();
    var position = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = position;
    }

    return new Cursor(position, selectionEnd);
  };

  CodeMirrorAdapter.prototype.setCursor = function (cursor) {
    this.cm.setSelection(
      this.cm.posFromIndex(cursor.position),
      this.cm.posFromIndex(cursor.selectionEnd)
    );
  };

  var addStyleRule = (function () {
    var added = {};
    var styleElement = document.createElement('style');
    document.documentElement.getElementsByTagName('head')[0].appendChild(styleElement);
    var styleSheet = styleElement.sheet;

    return function (css) {
      if (added[css]) { return; }
      added[css] = true;
      styleSheet.insertRule(css, (styleSheet.cssRules || styleSheet.rules).length);
    };
  }());

  CodeMirrorAdapter.prototype.setOtherCursor = function (cursor, color, clientId) {
    var cursorPos = this.cm.posFromIndex(cursor.position);
    if (cursor.position === cursor.selectionEnd) {
      // show cursor
      var cursorCoords = this.cm.cursorCoords(cursorPos);
      var cursorEl = document.createElement('pre');
      cursorEl.className = 'other-client';
      cursorEl.style.borderLeftWidth = '2px';
      cursorEl.style.borderLeftStyle = 'solid';
      cursorEl.innerHTML = '&nbsp;';
      cursorEl.style.borderLeftColor = color;
      cursorEl.style.height = (cursorCoords.bottom - cursorCoords.top) * 0.9 + 'px';
      cursorEl.style.marginTop = (cursorCoords.top - cursorCoords.bottom) + 'px';
      cursorEl.setAttribute('data-clientid', clientId);
      this.cm.addWidget(cursorPos, cursorEl, false);
      return {
        clear: function () {
          var parent = cursorEl.parentNode;
          if (parent) { parent.removeChild(cursorEl); }
        }
      };
    } else {
      // show selection
      var match = /^#([0-9a-fA-F]{6})$/.exec(color);
      if (!match) { throw new Error("only six-digit hex colors are allowed."); }
      var selectionClassName = 'selection-' + match[1];
      var rule = '.' + selectionClassName + ' { background: ' + color + '; }';
      addStyleRule(rule);

      var fromPos, toPos;
      if (cursor.selectionEnd > cursor.position) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(cursor.selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(cursor.selectionEnd);
        toPos = cursorPos;
      }
      return this.cm.markText(fromPos, toPos, {
        className: selectionClassName
      });
    }
  };

  CodeMirrorAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  CodeMirrorAdapter.prototype.applyOperation = function (operation) {
    this.ignoreNextChange = true;
    CodeMirrorAdapter.applyOperationToCodeMirror(operation, this.cm);
  };

  CodeMirrorAdapter.prototype.registerUndo = function (undoFn) {
    this.cm.undo = undoFn;
  };

  CodeMirrorAdapter.prototype.registerRedo = function (redoFn) {
    this.cm.redo = redoFn;
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Bind a method to an object, so it doesn't matter whether you call
  // object.method() directly or pass object.method as a reference to another
  // function.
  function bind (obj, method) {
    var fn = obj[method];
    obj[method] = function () {
      fn.apply(obj, arguments);
    };
  }

  return CodeMirrorAdapter;

}());

/*global ot */

ot.SocketIOAdapter = (function () {

  function SocketIOAdapter (socket) {
    this.socket = socket;

    var self = this;
    socket
      .on('client_left', function (clientId) {
        self.trigger('client_left', clientId);
      })
      .on('set_name', function (clientId, name) {
        self.trigger('set_name', clientId, name);
      })
      .on('ack', function () { self.trigger('ack'); })
      .on('operation', function (clientId, operation, cursor) {
        self.trigger('operation', operation);
        self.trigger('cursor', clientId, cursor);
      })
      .on('cursor', function (clientId, cursor) {
        self.trigger('cursor', clientId, cursor);
      })
      .on('reconnect', function () {
        self.trigger('reconnect');
      });
  }

  SocketIOAdapter.prototype.sendOperation = function (revision, operation, cursor) {
    this.socket.emit('operation', revision, operation, cursor);
  };

  SocketIOAdapter.prototype.sendCursor = function (cursor) {
    this.socket.emit('cursor', cursor);
  };

  SocketIOAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  SocketIOAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  return SocketIOAdapter;

}());
/*global ot, $ */

ot.AjaxAdapter = (function () {

  function AjaxAdapter (path, revision) {
    if (path[path.length - 1] !== '/') { path += '/'; }
    this.path = path;
    this.revision = revision;
    this.poll();
  }

  AjaxAdapter.prototype.poll = function () {
    var self = this;
    this.xhr = $.ajax({
      url: this.path + 'revision/' + this.revision,
      type: 'GET',
      dataType: 'json',
      success: function (data) {
        var operations = data.operations;
        for (var i = 0; i < operations.length; i++) {
          self.trigger('operation', operations[i]);
        }
        self.revision += operations.length;
        self.poll();
      },
      error: function (xhr, reason) {
        if (reason !== 'abort') {
          setTimeout(function () { self.poll(); }, 500);
        }
      }
    });
  };

  AjaxAdapter.prototype.sendOperation = function (revision, operation, cursor) {
    if (this.xhr) { this.xhr.abort(); }
    if (revision !== this.revision) { throw new Error("Revision numbers out of sync"); }
    var self = this;
    this.xhr = $.ajax({
      url: this.path + 'revision/' + revision,
      type: 'POST',
      data: JSON.stringify({ operation: operation, cursor: cursor }),
      contentType: 'application/json',
      processData: false,
      success: function (data) {
        var operations = data.operations;
        for (var i = 0; i < operations.length - 1; i++) {
          self.trigger('operation', operations[i]);
        }
        self.revision += operations.length;
        self.trigger('ack');
        self.poll();
      },
      error: function (xhr, status) {
        //if (reason !== '_cancelled') {}
        setTimeout(function () { self.sendOperation(revision, operation, cursor); }, 500);
      }
    });
  };

  AjaxAdapter.prototype.sendCursor = function (obj) {
    $.ajax({
      url: this.path + 'cursor',
      type: 'POST',
      data: JSON.stringify(obj),
      contentType: 'application/json',
      processData: false,
      timeout: 1000
    });
  };

  AjaxAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  AjaxAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  return AjaxAdapter;

})();

/*
class NeopreneAdapter
  constructor: (@renderUrl, @revision) ->
    _.bindAll(@)
    @operationToSend = null
    @listen()

  ajax: (options) ->
    @xhr?.abort()
    dfltOptions =
      url: @renderUrl(@revision)
      accept: 'json'
      dataType: 'json'
    @xhr = $.ajax _.extend dfltOptions, options

  listen: ->
    @ajax
      type: 'GET'
      success: (data) =>
        @parseOperations(data)
        @listen()
      error: (jqXhr, reason) =>
        return if reason is 'abort'
        @retry @listen

  retry: (fn) -> setTimeout fn, 500

  sendOperation: (revision, obj) ->
    if @revision != revision
      throw new Error("Revision numbers out of sync.")
    @ajax
      type: 'POST'
      contentType: 'application/json'
      data: JSON.stringify(obj.operation)
      success: (operations) =>
        @parseOperations(_.initial(operations))
        @revision += 1
        @trigger 'ack'
        @listen()
      error: (jqXhr, reason) =>
        @retry =>
          @sendOperation(revision, obj)

  parseOperations: (operations) ->
    @revision += operations.length

    for operation in operations
      @trigger 'operation',
        meta:
          clientId: 'lorem'
          cursor:
            position: 0
            selectionEnd: 0
        operation: operation
*/
/*global ot */

ot.EditorClient = (function () {
  var Client = ot.Client;
  var Cursor = ot.Cursor;
  var UndoManager = ot.UndoManager;
  var TextOperation = ot.TextOperation;
  var WrappedOperation = ot.WrappedOperation;


  function SelfMeta (cursorBefore, cursorAfter) {
    this.cursorBefore = cursorBefore;
    this.cursorAfter  = cursorAfter;
  }

  SelfMeta.prototype.invert = function () {
    return new SelfMeta(this.cursorAfter, this.cursorBefore);
  };

  SelfMeta.prototype.compose = function (other) {
    return new SelfMeta(this.cursorBefore, other.cursorAfter);
  };

  SelfMeta.prototype.transform = function (operation) {
    return new SelfMeta(
      this.cursorBefore.transform(operation),
      this.cursorAfter.transform(operation)
    );
  };


  function OtherMeta (clientId, cursor) {
    this.clientId = clientId;
    this.cursor   = cursor;
  }

  OtherMeta.fromJSON = function (obj) {
    return new OtherMeta(
      obj.clientId,
      obj.cursor && Cursor.fromJSON(obj.cursor)
    );
  };

  OtherMeta.prototype.transform = function (operation) {
    return new OtherMeta(
      this.clientId,
      this.cursor && this.cursor.transform(operation)
    );
  };


  function OtherClient (id, listEl, editorAdapter, name, cursor) {
    this.id = id;
    this.listEl = listEl;
    this.editorAdapter = editorAdapter;
    this.name = name;

    this.li = document.createElement('li');
    if (name) {
      this.li.textContent = name;
      this.listEl.appendChild(this.li);
    }

    this.setColor(name ? hueFromName(name) : Math.random());
    if (cursor) { this.updateCursor(cursor); }
  }

  OtherClient.prototype.setColor = function (hue) {
    this.hue = hue;
    this.color = hsl2hex(hue, 0.75, 0.5);
    this.lightColor = hsl2hex(hue, 0.5, 0.9);
    if (this.li) { this.li.style.color = this.color; }
  };

  OtherClient.prototype.setName = function (name) {
    this.name = name;

    this.li.textContent = name;
    if (!this.li.parentNode) {
      this.listEl.appendChild(this.li);
    }

    this.setColor(hueFromName(name));
  };

  OtherClient.prototype.updateCursor = function (cursor) {
    this.removeCursor();
    this.cursor = cursor;
    this.mark = this.editorAdapter.setOtherCursor(
      cursor,
      cursor.position === cursor.selectionEnd ? this.color : this.lightColor,
      this.id
    );
  };

  OtherClient.prototype.remove = function () {
    if (this.li) { removeElement(this.li); }
    this.removeCursor();
  };

  OtherClient.prototype.removeCursor = function () {
    if (this.mark) { this.mark.clear(); }
  };


  function EditorClient (revision, clients, serverAdapter, editorAdapter) {
    Client.call(this, revision);
    this.serverAdapter = serverAdapter;
    this.editorAdapter = editorAdapter;
    this.undoManager = new UndoManager();

    this.initializeClientList();
    this.initializeClients(clients);

    var self = this;

    this.editorAdapter.registerCallbacks({
      change: function (oldValue, operation) { self.onChange(oldValue, operation); },
      cursorActivity: function () { self.onCursorActivity(); },
      blur: function () { self.onBlur(); }
    });
    this.editorAdapter.registerUndo(function () { self.undo(); });
    this.editorAdapter.registerRedo(function () { self.redo(); });

    this.serverAdapter.registerCallbacks({
      client_left: function (clientId) { self.onClientLeft(clientId); },
      set_name: function (clientId, name) { self.getClientObject(clientId).setName(name); },
      ack: function () { self.serverAck(); },
      operation: function (operation) {
        self.applyServer(TextOperation.fromJSON(operation));
      },
      cursor: function (clientId, cursor) {
        if (cursor) {
          self.getClientObject(clientId).updateCursor(
            self.transformCursor(Cursor.fromJSON(cursor))
          );
        } else {
          self.getClientObject(clientId).removeCursor();
        }
      },
      reconnect: function () { self.serverReconnect(); }
    });
  }

  inherit(EditorClient, Client);

  EditorClient.prototype.initializeClients = function (clients) {
    this.clients = {};
    for (var clientId in clients) {
      if (clients.hasOwnProperty(clientId)) {
        var client = clients[clientId];
        client.clientId = clientId;
        this.clients[clientId] = new OtherClient(
          client.clientId,
          this.clientListEl,
          this.editorAdapter,
          client.name,
          client.cursor ? Cursor.fromJSON(client.cursor) : null
        );
      }
    }
  };

  EditorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    return this.clients[clientId] = new OtherClient(
      clientId,
      this.clientListEl,
      this.editorAdapter
    );
  };

  EditorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    client.remove();
    delete this.clients[clientId];
  };

  EditorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
  };

  EditorClient.prototype.applyUnredo = function (operation) {
    this.undoManager.add(operation.invert(this.editorAdapter.getValue()));
    this.editorAdapter.applyOperation(operation.wrapped);
    this.cursor = operation.meta.cursorAfter;
    this.editorAdapter.setCursor(this.cursor);
    this.applyClient(operation);
  };

  EditorClient.prototype.undo = function () {
    var self = this;
    if (!this.undoManager.canUndo()) { return; }
    this.undoManager.performUndo(function (o) { self.applyUnredo(o); });
  };

  EditorClient.prototype.redo = function () {
    var self = this;
    if (!this.undoManager.canRedo()) { return; }
    this.undoManager.performRedo(function (o) { self.applyUnredo(o); });
  };

  EditorClient.prototype.onChange = function (oldValue, textOperation) {
    var cursorBefore = this.cursor;
    this.updateCursor();
    var meta = new SelfMeta(cursorBefore, this.cursor);
    var operation = new WrappedOperation(textOperation, meta);
    var compose = this.undoManager.undoStack.length > 0 &&
      !this.undoManager.dontCompose &&
      last(this.undoManager.undoStack).wrapped
        .invert(oldValue)
        .shouldBeComposedWith(textOperation);
    this.undoManager.add(operation.invert(oldValue), compose);
    this.applyClient(textOperation);
  };

  EditorClient.prototype.updateCursor = function () {
    this.cursor = this.editorAdapter.getCursor();
  };

  EditorClient.prototype.onCursorActivity = function () {
    var oldCursor = this.cursor;
    this.updateCursor();
    if (oldCursor && this.cursor.equals(oldCursor)) { return; }
    this.sendCursor(this.cursor);
  };

  EditorClient.prototype.onBlur = function () {
    this.cursor = null;
    this.sendCursor(null);
  };

  EditorClient.prototype.sendCursor = function (cursor) {
    if (this.state instanceof Client.AwaitingWithBuffer) { return; }
    this.serverAdapter.sendCursor(cursor);
  };

  EditorClient.prototype.sendOperation = function (revision, operation) {
    this.serverAdapter.sendOperation(revision, operation.toJSON(), this.cursor);
  };

  EditorClient.prototype.applyOperation = function (operation) {
    this.editorAdapter.applyOperation(operation);
    this.updateCursor();
    this.undoManager.transform(new WrappedOperation(operation, null));
  };

  function rgb2hex (r, g, b) {
    function digits (n) {
      var m = Math.round(255*n).toString(16);
      return m.length === 1 ? '0'+m : m;
    }
    return '#' + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex (h, s, l) {
    if (s === 0) { return rgb2hex(l, l, l); }
    var var2 = l < 0.5 ? l * (1+s) : (l+s) - (s*l);
    var var1 = 2 * l - var2;
    var hue2rgb = function (hue) {
      if (hue < 0) { hue += 1; }
      if (hue > 1) { hue -= 1; }
      if (6*hue < 1) { return var1 + (var2-var1)*6*hue; }
      if (2*hue < 1) { return var2; }
      if (3*hue < 2) { return var1 + (var2-var1)*6*(2/3 - hue); }
      return var1;
    };
    return rgb2hex(hue2rgb(h+1/3), hue2rgb(h), hue2rgb(h-1/3));
  }

  function hueFromName (name) {
    var a = 1;
    for (var i = 0; i < name.length; i++) {
      a = 17 * (a+name.charCodeAt(i)) % 360;
    }
    return a/360;
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function last (arr) { return arr[arr.length - 1]; }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  return EditorClient;
}());
