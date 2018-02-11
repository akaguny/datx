import {
  getModelType,
  ICollectionConstructor,
  IIdentifier,
  IModelConstructor,
  initModelRef,
  IType,
  PureCollection,
  PureModel,
  ReferenceType,
  updateModel,
} from 'datx';
import {IDictionary, IRawModel, mapItems} from 'datx-utils';

import {URL_REGEX} from './consts';
import {ParamArrayType} from './enums/ParamArrayType';
import {GenericModel} from './GenericModel';
import {flattenModel, removeModel} from './helpers/model';
import {getValue} from './helpers/utils';
import {IFilters} from './interfaces/IFilters';
import {IHeaders} from './interfaces/IHeaders';
import {IJsonapiCollection} from './interfaces/IJsonapiCollection';
import {IJsonapiModel} from './interfaces/IJsonapiModel';
import {IRequestOptions} from './interfaces/IRequestOptions';
import {IDefinition, IRelationship, IRequest} from './interfaces/JsonApi';
import {IRecord, IResponse} from './interfaces/JsonApi';
import {config, fetch, read} from './NetworkUtils';
import {Response} from './Response';

export function decorateCollection(BaseClass: typeof PureCollection) {

  class JsonapiCollection extends BaseClass {

    public static types = (BaseClass.types && BaseClass.types.length) ? BaseClass.types : [GenericModel];

    public sync(body?: IResponse): PureModel|Array<PureModel>|null {
      if (!body) {
        return null;
      }
      const data: PureModel|Array<PureModel>|null = this.__iterateEntries(body, this.__addRecord.bind(this));
      this.__iterateEntries(body, this.__updateRelationships.bind(this));
      return data;
    }

    /**
     * Fetch the records with the given type and id
     *
     * @param {string} type Record type
     * @param {number|string} type Record id
     * @param {IRequestOptions} [options] Server options
     * @returns {Promise<Response>} Resolves with the Response object or rejects with an error
     */
    public fetch<T extends IJsonapiModel = IJsonapiModel>(
      type: IType|IModelConstructor<T>,
      id: number|string,
      options?: IRequestOptions,
    ): Promise<Response<T>> {
      const modelType = getModelType(type);
      const query = this.__prepareQuery(modelType, id, undefined, options);
      return read<T>(this, query.url, query.headers, options)
        .then((res) => this.__handleErrors<T>(res));
    }

    /**
     * Fetch the first page of records of the given type
     *
     * @param {string} type Record type
     * @param {IRequestOptions} [options] Server options
     * @returns {Promise<Response>} Resolves with the Response object or rejects with an error
     */
    public fetchAll<T extends IJsonapiModel = IJsonapiModel>(
      type: IType|IModelConstructor<T>,
      options?: IRequestOptions,
    ): Promise<Response<T>> {
      const modelType = getModelType(type);
      const query = this.__prepareQuery(modelType, undefined, undefined, options);
      return read<T>(this, query.url, query.headers, options)
        .then((res) => this.__handleErrors<T>(res));
    }

    public request<T extends IJsonapiModel = IJsonapiModel>(
      url: string,
      method: string = 'GET',
      data?: object,
      options?: IRequestOptions,
    ): Promise<Response<T>> {
      return fetch<T>({url: this.__prefixUrl(url), options, data, method, collection: this});
    }

    public remove(type: IType|typeof PureModel, id?: IIdentifier, remote?: boolean|IRequestOptions);
    public remove(model: PureModel, remote?: boolean|IRequestOptions);
    public remove(
      obj: IType|typeof PureModel|PureModel,
      id?: IIdentifier|boolean|IRequestOptions,
      remote?: boolean|IRequestOptions,
    ) {
      const remove = (typeof id === 'boolean' || typeof id === 'object') ? id : remote;
      const modelId = (typeof id !== 'boolean' && typeof id !== 'object') ? id : undefined;
      const type = getModelType(obj);
      const model = this.find(type, modelId);

      if (model && remove) {
        return removeModel(model, typeof remove === 'object' ? remove : undefined);
      }

      if (model) {
        super.remove(model);
      }
      return Promise.resolve();
    }

    /**
     * Function used to handle response errors
     *
     * @private
     * @param {Response} response API response
     * @returns API response
     */
    private __handleErrors<T extends IJsonapiModel>(response: Response<T>) {
      if (response.error) {
        throw response.error;
      }

      return response;
    }

    private __addRecord(obj: IRecord): IJsonapiModel {
      const staticCollection = this.constructor as typeof PureCollection;
      const {type, id} = obj;
      let record = this.find(type, id) as IJsonapiModel|null;
      const flattened: IRawModel = flattenModel(obj);
=
      if (record) {
        updateModel(record, flattened);
      } else if (staticCollection.types.filter((item) => item.type === type).length) {
        record = this.add(flattened, type) as IJsonapiModel;
      } else {
        record = this.add(new GenericModel(flattened));
      }

      return record;
    }

    private __updateRelationships(obj: IRecord): void {
      const record: PureModel|null = this.find(obj.type, obj.id);
      const refs: Array<string> = obj.relationships ? Object.keys(obj.relationships) : [];
      refs.forEach((ref: string) => {
        const items = (obj.relationships as IDictionary<IRelationship>)[ref].data;
        if (items instanceof Array && items.length < 1) {
          // it's only possible to update items with one ore more refs. Early exit
          return;
        }
        if (items && record) {
          const models: PureModel|Array<PureModel>|IIdentifier|undefined|null = mapItems(
            items,
            (def: IDefinition) => this.find(def.type, def.id) || def.id,
          );

          const itemType: string = items instanceof Array ? items[0].type : items.type;
          if (ref in record) {
            record[ref] = models;
          } else {
            // @ts-ignore - Ignore until datx is updated
            initModelRef(record, ref, {model: itemType, type: ReferenceType.TO_ONE_OR_MANY}, models);
          }
        }
      });
    }

    private __iterateEntries(body: IResponse, fn: (item: PureModel) => PureModel) {
      mapItems((body && body.included) || [], fn);
      return mapItems((body && body.data) || [], fn);
    }

    private __prepareQuery(
      type: IType,
      id?: number|string,
      data?: IRequest,
      options?: IRequestOptions,
    ): {
      url: string,
      data?: object,
      headers: IHeaders,
    } {
      const staticCollection = this.constructor as typeof PureCollection;
      const model: PureModel = staticCollection.types.filter((item) => item.type === type)[0];
      const path: string = model
        ? (getValue<string>(model['endpoint']) || model['baseUrl'] || getModelType(model))
        : type;

      const url: string = id ? `${path}/${id}` : `${path}`;
      const headers: IDictionary<string> = (options && options.headers) || {};

      const params: Array<string> = [
        ...this.__prepareFilters((options && options.filter) || {}),
        ...this.__prepareSort(options && options.sort),
        ...this.__prepareIncludes(options && options.include),
        ...this.__prepareFields((options && options.fields) || {}),
        ...this.__prepareRawParams((options && options.params) || []),
      ];

      const baseUrl: string = this.__appendParams(this.__prefixUrl(url), params);
      return {data, headers, url: baseUrl};
    }

    private __prepareFilters(filters: IFilters): Array<string> {
      return this.__parametrize(filters).map((item) => `filter[${item.key}]=${item.value}`);
    }

    private __prepareSort(sort?: string|Array<string>): Array<string> {
      return sort ? [`sort=${sort}`] : [];
    }

    private __prepareIncludes(include?: string|Array<string>): Array<string> {
      return include ? [`include=${include}`] : [];
    }

    private __prepareFields(fields: IDictionary<string|Array<string>>): Array<string> {
      const list: Array<string> = [];

      Object.keys(fields).forEach((key) => {
        list.push(`fields[${key}]=${fields[key]}`);
      });

      return list;
    }

    private __prepareRawParams(params: Array<{key: string, value: string}|string>): Array<string> {
      return params.map((param) => {
        if (typeof param === 'string') {
          return param;
        }
        return `${param.key}=${param.value}`;
      });
    }

    private __prefixUrl(url) {
      if (URL_REGEX.test(url)) {
        return url;
      }
      return `${config.baseUrl}${url}`;
    }

    private __appendParams(url: string, params: Array<string>): string {
      if (params.length) {
        url += '?' + params.join('&');
      }
      return url;
    }

    private __parametrize(params: object, scope: string = '') {
      const list: Array<{key: string, value: string}> = [];

      Object.keys(params).forEach((key) => {
        if (params[key] instanceof Array) {
          if (config.paramArrayType === ParamArrayType.OBJECT_PATH) {
            list.push(...this.__parametrize(params[key], `${key}.`));
          } else if (config.paramArrayType === ParamArrayType.COMMA_SEPARATED) {
            list.push({key: `${scope}${key}`, value: params[key].join(',')});
          } else if (config.paramArrayType === ParamArrayType.MULTIPLE_PARAMS) {
            list.push(...params[key].map((param) => ({key: `${scope}${key}`, value: param})));
          } else if (config.paramArrayType === ParamArrayType.PARAM_ARRAY) {
            list.push(...params[key].map((param) => ({key: `${scope}${key}][`, value: param})));
          }
        } else if (typeof params[key] === 'object') {
          list.push(...this.__parametrize(params[key], `${key}.`));
        } else {
          list.push({key: `${scope}${key}`, value: params[key]});
        }
      });

      return list;
    }
  }

  return JsonapiCollection as ICollectionConstructor<PureCollection & IJsonapiCollection>;
}
