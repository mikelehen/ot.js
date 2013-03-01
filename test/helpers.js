(function (exports) {

  var TextOperation = typeof exports.ot === 'object' ? exports.ot.TextOperation
    : require('../lib/text-operation');

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  function randomString (n) {
    var str = '';
    while (n--) {
      var chr = randomInt(26) + 97;
      str = str + String.fromCharCode(chr);
    }
    return str;
  }

  var attrNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  var attrValues = [-4, 0, 10, 50, '0', '10', 'a', 'b', 'c', true, false];

  function randomAttributes(allowFalse) {
    var attributes = { };
    var count = randomInt(3);
    for(var i = 0; i < count; i++) {
      var name = attrNames[randomInt(attrNames.length)];
      var value = attrValues[randomInt(attrValues.length - (allowFalse ? 0 : 1))];
      attributes[name] = value;
    }

    return attributes;
  }

  function randomAttributesArray(n) {
    var attributes = Array(n);
    for(var i = 0; i < n; i++) {
      attributes[i] = randomAttributes();
    }
    return attributes;
  }

  function randomOperation (str, useAttributes) {
    var operation = new TextOperation();
    var left;
    while (true) {
      left = str.length - operation.baseLength;
      if (left === 0) { break; }
      var r = Math.random();
      var l = 1 + randomInt(Math.min(left, 20));
      if (r < 0.2) {
        operation.insert(randomString(l), (useAttributes ? randomAttributes() : { }));
      } else if (r < 0.4) {
        operation['delete'](str.slice(operation.baseLength, operation.baseLength + l));
      } else {
        operation.retain(l, (useAttributes ? randomAttributes(/*allowFalse=*/true) : { }));
      }
    }
    if (Math.random() < 0.3) {
      operation.insert(1 + randomString(10));
    }
    return operation;
  }

  function randomElement (arr) {
    return arr[randomInt(arr.length)];
  }

  // A random test generates random data to check some invariants. To increase
  // confidence in a random test, it is run repeatedly.
  function randomTest (n, fun) {
    return function (test) {
      while (n--) {
        fun(test);
      }
      test.done();
    };
  }

  exports.randomInt = randomInt;
  exports.randomString = randomString;
  exports.randomAttributesArray = randomAttributesArray;
  exports.randomOperation = randomOperation;
  exports.randomElement = randomElement;
  exports.randomTest = randomTest;

})(typeof exports === 'object' ? exports : this);