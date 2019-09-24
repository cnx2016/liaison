import ow from 'ow';
import {hasOwnProperty, getPropertyDescriptor} from '@liaison/util';
import {syncOrAsync} from '@deepr/util';

import {MissingPropertyEmitter} from './missing-property-emitter';

const EMPTY_MAP = new Map();

export const Registerable = (Base = MissingPropertyEmitter) =>
  class Registerable extends Base {
    // === Static methods ===

    static $getRegisteredName() {
      return this.__registeredName;
    }

    static $setRegisteredName(registeredName) {
      Object.defineProperty(this, '__registeredName', {value: registeredName});
    }

    static $isRegistered() {
      return this.__registeredName !== undefined;
    }

    static $getLayer({throwIfNotFound = true} = {}) {
      const layer = hasOwnProperty(this, '__layer') ? this.__layer : undefined;
      if (layer) {
        return layer;
      }
      if (throwIfNotFound) {
        throw new Error(`Layer not found`);
      }
    }

    static get $layer() {
      return this.$getLayer();
    }

    static $setLayer(layer) {
      Object.defineProperty(this, '__layer', {value: layer});
    }

    static $hasLayer() {
      return this.$getLayer({throwIfNotFound: false}) !== undefined;
    }

    static $getParentLayer({throwIfNotFound = true} = {}) {
      const layer = this.$getLayer({throwIfNotFound});
      return layer?.getParent({throwIfNotFound});
    }

    static $hasParentLayer() {
      const layer = this.$getLayer({throwIfNotFound: false});
      return layer ? layer.hasParent() : false;
    }

    static $callParentLayer(methodName, ...args) {
      const layer = this.$getLayer();
      const query = this.__buildQuery(methodName, ...args);
      return syncOrAsync(layer.sendQuery(query), ({result}) => result);
    }

    static __buildQuery(methodName, ...args) {
      return {
        [`${this.$getRegisteredName()}=>`]: {
          [`${methodName}=>result`]: {
            '([])': args
          }
        }
      };
    }

    static $exposeProperty(name, type, options) {
      ow(type, ow.string.oneOf(['field', 'method']));
      const setting = ow.optional.any(ow.boolean, ow.string.nonEmpty, ow.array, ow.set);
      if (type === 'field') {
        ow(options, ow.object.exactShape({read: setting, write: setting}));
      } else if (type === 'method') {
        ow(options, ow.object.exactShape({call: setting}));
      }

      if (!this.__exposedProperties) {
        this.__exposedProperties = new Map();
      } else if (!hasOwnProperty(this, '__exposedProperties')) {
        this.__exposedProperties = new Map(this.__exposedProperties);
      }

      this.__exposedProperties.set(name, {name, type, ...options});
    }

    static $getExposedProperty(name) {
      return this.__exposedProperties?.get(name);
    }

    static $getExposedProperties() {
      return this.__exposedProperties || EMPTY_MAP;
    }

    // eslint-disable-next-line no-unused-vars
    static async $exposedPropertyOperationIsAllowed({property, operation, setting}) {
      if (setting === true) {
        return true;
      }

      if (setting === false) {
        return false;
      }

      return undefined;
    }

    static $onMissingProperty(name) {
      if (typeof name === 'symbol' || name.startsWith('_')) {
        // Symbols and property names prefixed with an underscore shouldn't be exposed
        return undefined;
      }

      const parentRegistrable = this.__getParentRegistrable();
      if (!parentRegistrable) {
        return undefined;
      }

      const exposedProperty = parentRegistrable.$getExposedProperty(name);
      if (!exposedProperty) {
        return undefined;
      }

      if (exposedProperty.type !== 'method') {
        throw new Error('Currently, only exposed methods are supported');
      }

      return function (...args) {
        return this.$callParentLayer(name, ...args);
      };
    }

    static __getParentRegistrable() {
      const registeredName = this.$getRegisteredName();

      if (!registeredName) {
        return undefined;
      }

      const parentLayer = this.$getParentLayer({throwIfNotFound: false});
      const parentRegistrable = parentLayer?.get(registeredName, {throwIfNotFound: false});

      if (!isExposed(parentRegistrable)) {
        return undefined;
      }

      return parentRegistrable;
    }

    static $fork() {
      return class extends this {};
    }

    static $introspect() {
      const introspection = {
        _type: 'class'
      };

      for (const {name, type} of this.$getExposedProperties().values()) {
        introspection[name] = {_type: type};
      }

      introspection.prototype = this.prototype.$introspect();

      return introspection;
    }

    // === Instance methods ===

    $getRegisteredName() {
      return this.constructor.$getRegisteredName.call(this);
    }

    $setRegisteredName(registeredName) {
      this.constructor.$setRegisteredName.call(this, registeredName);
    }

    $isRegistered() {
      return this.constructor.$isRegistered.call(this);
    }

    $getLayer({fallBackToClass = true, throwIfNotFound = true} = {}) {
      // First, let try to get the instance's layer
      const layer = this.constructor.$getLayer.call(this, {
        throwIfNotFound: throwIfNotFound && !fallBackToClass
      });
      if (layer) {
        return layer;
      }
      if (fallBackToClass) {
        // If not found, let's fall back to the class' layer
        return this.constructor.$getLayer({throwIfNotFound});
      }
    }

    get $layer() {
      return this.$getLayer();
    }

    $setLayer(layer) {
      this.constructor.$setLayer.call(this, layer);
    }

    $hasLayer({fallBackToClass = true} = {}) {
      return this.$getLayer({fallBackToClass, throwIfNotFound: false}) !== undefined;
    }

    $getParentLayer({fallBackToClass = true, throwIfNotFound = true} = {}) {
      const layer = this.$getLayer({fallBackToClass, throwIfNotFound});
      return layer?.getParent({throwIfNotFound});
    }

    $hasParentLayer({fallBackToClass = true} = {}) {
      const layer = this.$getLayer({fallBackToClass, throwIfNotFound: false});
      return layer ? layer.hasParent() : false;
    }

    $callParentLayer(methodName, ...args) {
      return this.constructor.$callParentLayer.call(this, methodName, ...args);
    }

    __buildQuery(methodName, ...args) {
      if (this.$isRegistered()) {
        return {
          [`${this.$getRegisteredName()}=>`]: {
            [`${methodName}=>result`]: {
              '([])': args
            }
          }
        };
      }

      return {
        '<=': this,
        [`${methodName}=>result`]: {
          '([])': args
        },
        '=>changes': true
      };
    }

    $exposeProperty(name, type, options) {
      this.constructor.$exposeProperty.call(this, name, type, options);
    }

    $getExposedProperty(name) {
      return this.constructor.$getExposedProperty.call(this, name);
    }

    $getExposedProperties() {
      return this.constructor.$getExposedProperties.call(this);
    }

    async $exposedPropertyOperationIsAllowed({property, operation, setting}) {
      return await this.constructor.$exposedPropertyOperationIsAllowed.call(this, {
        property,
        operation,
        setting
      });
    }

    $onMissingProperty(name) {
      return this.constructor.$onMissingProperty.call(this, name);
    }

    __getParentRegistrable() {
      let registeredName = this.$getRegisteredName();

      if (registeredName) {
        // The instance is registered
        const parentLayer = this.$getParentLayer({fallBackToClass: false, throwIfNotFound: false});
        const parentRegistrable = parentLayer?.get(registeredName, {throwIfNotFound: false});
        if (!isExposed(parentRegistrable)) {
          return undefined;
        }
        return parentRegistrable;
      }

      // Let's fallback to the class
      registeredName = this.constructor.$getRegisteredName();

      if (!registeredName) {
        return undefined;
      }

      const parentLayer = this.constructor.$getParentLayer({throwIfNotFound: false});
      const parentRegistrable = parentLayer?.get(registeredName, {throwIfNotFound: false});

      if (!isExposed(parentRegistrable)) {
        return undefined;
      }

      return parentRegistrable.prototype;
    }

    $fork() {
      return Object.create(this);
    }

    $introspect() {
      const introspection = {
        _type: 'instance'
      };

      for (const {name, type} of this.$getExposedProperties().values()) {
        introspection[name] = {_type: type};
      }

      return introspection;
    }
  };

// === Exposition ===

export function expose(options = {}) {
  return function (target, name, descriptor) {
    if (!name) {
      // @expose() used on a class or an object
      // TODO: Get rid of this
      target.__isExposed = true;
      return target;
    }

    if (descriptor.initializer !== undefined) {
      // @expose() used on an inherited property shortcut
      // Examples: `@expose() title;` or `@expose() save;`
      const prototype = Object.getPrototypeOf(target);
      descriptor = getPropertyDescriptor(prototype, name);
    }

    const type = typeof descriptor.value === 'function' ? 'method' : 'field';

    target.$exposeProperty(name, type, options);

    return descriptor;
  };
}

export function isExposed(target, name) {
  if (target === undefined) {
    return false;
  }
  if (!name) {
    // @isExposed() called with a class or an instance
    return target.__isExposed === true;
  }
  return target.$getExposedProperty(name) !== undefined;
}

// === Utilities ===

export function isRegisterable(value) {
  return typeof value?.$getLayer === 'function';
}
