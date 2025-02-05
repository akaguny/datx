import { getMeta, setMeta, deprecated } from '@datx/utils';

import { PureModel } from './PureModel';
import { IType } from './interfaces/IType';
import { MetaClassField } from './enums/MetaClassField';
import { ReferenceType } from './enums/ReferenceType';
import { getModelType, isModelReference } from './helpers/model/utils';
import { IModelConstructor } from './interfaces/IModelConstructor';
import { IIdentifier } from './interfaces/IIdentifier';
import { PureCollection } from './PureCollection';
import { isModel } from './helpers/mixin';

export function getClass<T extends PureModel>(obj: T): typeof PureModel {
  return (typeof obj === 'function' ? obj : obj.constructor) as typeof PureModel;
}

function prepareDecorator<T extends PureModel>(_obj: T, _key: string, opts?: object): void {
  if (opts && 'initializer' in opts) {
    opts['initializer'] = undefined;

    // Babel 7 + Decorators fix
    // Required to prevent the initializerDefineProperty call in babel-runtime
    // If initializer is undefined, the descriptor will be null and therefore
    // the initializerDefineProperty will be skipped

    // https://github.com/babel/babel/blob/3aaafae053fa75febb3aa45d45b6f00646e30ba4/packages/babel-helpers/src/helpers.js#L1019
  }
}

type BasicRefModel = typeof PureModel | IType;
export type FunctionRefModel = (
  data: object,
  parentModel: PureModel,
  key: string,
  collection?: PureCollection,
) => BasicRefModel;
export type ParsedRefModel = IType | FunctionRefModel;
export type DynamicRefModel = BasicRefModel | FunctionRefModel;

interface IAttributeFieldOptions {
  defaultValue?: any;
  isIdentifier?: true;
  isType?: true;
  map?: string;
  parse?: (value: any, data: object) => any;
  serialize?: (value: any, data: object) => any;
}

interface IAttributeNoReference {
  toOne?: undefined;
  toOneOrMany?: undefined;
  toMany?: undefined;
  referenceProperty?: undefined;
}

interface IAttributeToOne {
  toOne: DynamicRefModel;
  toOneOrMany?: undefined;
  toMany?: undefined;
  referenceProperty?: undefined;
}

interface IAttributeToOneOrMany {
  toOne?: undefined;
  toOneOrMany: DynamicRefModel;
  toMany?: undefined;
  referenceProperty?: undefined;
}

interface IAttributeToMany {
  toOne?: undefined;
  toOneOrMany?: undefined;
  toMany: DynamicRefModel;
  referenceProperty?: string;
}

type IAttributeOptions = IAttributeFieldOptions &
  (IAttributeNoReference | IAttributeToOne | IAttributeToOneOrMany | IAttributeToMany);

export interface IReferenceDefinition {
  type: ReferenceType;
  model: ParsedRefModel;
  property?: string;
}

export interface IFieldDefinition {
  referenceDef: IReferenceDefinition | false;
  defaultValue?: any;
}

function parseModelRef(ref: DynamicRefModel): ParsedRefModel {
  if (ref instanceof PureModel || isModel(ref) || isModelReference(ref)) {
    return getModelType(ref);
  }

  if (typeof ref === 'string' || typeof ref === 'number') {
    return ref;
  }

  return ref as FunctionRefModel;
}

function getReferenceDef(
  toOne?: DynamicRefModel,
  toOneOrMany?: DynamicRefModel,
  toMany?: DynamicRefModel,
  referenceProperty?: string,
): IReferenceDefinition | false {
  if (toOne) {
    return {
      type: ReferenceType.TO_ONE,
      model: parseModelRef(toOne),
    };
  }

  if (toOneOrMany) {
    return {
      type: ReferenceType.TO_ONE_OR_MANY,
      model: parseModelRef(toOneOrMany),
    };
  }

  if (toMany) {
    return {
      type: ReferenceType.TO_MANY,
      model: parseModelRef(toMany),
      property: referenceProperty,
    };
  }

  return false;
}

/**
 * Set a model attribute as tracked
 */
export function Attribute<T extends PureModel>({
  defaultValue,
  isIdentifier,
  isType,
  toOne,
  toOneOrMany,
  toMany,
  referenceProperty,
  map,
  parse,
  serialize,
}: IAttributeOptions = {}) {
  return (obj: T, key: string, opts?: object): void => {
    prepareDecorator(obj, key, opts);
    const modelClass = getClass(obj);

    const modelClassFields = getMeta<Record<string, IFieldDefinition>>(
      modelClass,
      MetaClassField.Fields,
      {},
    );

    modelClassFields[key] = {
      referenceDef: getReferenceDef(toOne, toOneOrMany, toMany, referenceProperty),
      defaultValue,
    };
    setMeta(modelClass, MetaClassField.Fields, modelClassFields);
    setMeta(modelClass, `${MetaClassField.MapField}_${key}`, map);
    setMeta(modelClass, `${MetaClassField.MapParse}_${key}`, parse);
    setMeta(modelClass, `${MetaClassField.MapSerialize}_${key}`, serialize);

    if (isIdentifier) {
      setMeta(modelClass, MetaClassField.IdField, key);
    }

    if (isType) {
      setMeta(modelClass, MetaClassField.TypeField, key);
    }
  };
}

export function ViewAttribute<TCollection extends PureCollection, TModel extends PureModel>(
  modelType: IModelConstructor<TModel> | IType,
  options: {
    sortMethod?: string | ((item: TModel) => any);
    models?: Array<IIdentifier | TModel>;
    unique?: boolean;
    mixins?: Array<(view: any) => any>;
  } = {},
) {
  return (obj: TCollection, key: string, opts?: object): void => {
    prepareDecorator(obj, key, opts);
    if (!Object.hasOwnProperty.call(obj.constructor, 'views')) {
      obj.constructor['views'] = {};
    }
    obj.constructor['views'][key] = Object.assign(
      {
        modelType,
      },
      options,
    );
  };
}

const propDeprecation = '@prop was deprecated, use @Attribute instead';

// Compatibility implementation
function propFn<T extends PureModel>(obj: T, key: string, opts?: object): void {
  deprecated(propDeprecation);
  Attribute()(obj, key, opts);
}

export const prop = Object.assign(propFn, {
  defaultValue(value: any) {
    deprecated(propDeprecation);
    return Attribute({ defaultValue: value });
  },

  toOne(refModel: typeof PureModel | IType) {
    deprecated(propDeprecation);
    return Attribute({ toOne: refModel });
  },

  toMany(refModel: typeof PureModel | IType, property?: string) {
    deprecated(propDeprecation);
    return Attribute({ toMany: refModel, referenceProperty: property });
  },

  toOneOrMany(refModel: typeof PureModel | IType) {
    deprecated(propDeprecation);
    return Attribute({ toOneOrMany: refModel });
  },

  identifier: Attribute({ isIdentifier: true }),

  type: Attribute({ isType: true }),
});

export const view = ViewAttribute;
