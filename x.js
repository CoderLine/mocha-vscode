const vm = require('vm');

const fnProxy = new Proxy(function () {console.log('called')}, {
  get(target, prop, receiver) {
    return prop.toUpperCase();
  }
});

fnProxy();

const context = vm.createContext(new Proxy({}, {
  get(target, prop, receiver) {
    return prop.toUpperCase();
  }
}));

console.log(vm.runInContext('you + can + literally + run + anything + here + require', context));

// => YOUCANLITERALLYRUNANYTHINGHERE
