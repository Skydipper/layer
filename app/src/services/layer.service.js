const logger = require('logger');
const Layer = require('models/layer.model');
const GraphService = require('services/graph.service');
const LayerDuplicated = require('errors/layerDuplicated.error');
const LayerNotFound = require('errors/layerNotFound.error');
const LayerProtected = require('errors/layerProtected.error');
const slug = require('slug');
const RelationshipsService = require('services/relationships.service');
const ctRegisterMicroservice = require('sd-ct-register-microservice-node');
const stage = process.env.NODE_ENV;


class LayerService {

    static async getSlug(name) {
        let valid = false;
        let slugTemp = null;
        let i = 0;
        while (!valid) {
            slugTemp = slug(name);
            if (i > 0) {
                slugTemp += `_${i}`;
            }
            const currentDataset = await Layer.findOne({
                slug: slugTemp
            }).exec();
            if (!currentDataset) {
                return slugTemp;
            }
            i++;
        }
    }

    static getFilteredQuery(query, ids = []) {
        const collection = query.collection;
        const favourite = query.favourite;
        if (!query.application && query.app) {
            query.application = query.app;
            if (favourite) {
                delete query.application;
            }
        }
        if (!query.env) { // default value
            query.env = 'production';
        }
        // if (!query.published) { // default value
        //     query.published = true;
        // }
        const layerAttributes = Object.keys(Layer.schema.paths);
        Object.keys(query).forEach((param) => {
            if (layerAttributes.indexOf(param) < 0) {
                delete query[param];
            } else if (param !== 'env') {
                switch (Layer.schema.paths[param].instance) {

                case 'String':
                    query[param] = {
                        $regex: query[param],
                        $options: 'i'
                    };
                    break;
                case 'Array':
                    if (query[param].indexOf('@') >= 0) {
                        query[param] = {
                            $all: query[param].split('@').map(elem => elem.trim())
                        };
                    } else {
                        query[param] = {
                            $in: query[param].split(',').map(elem => elem.trim())
                        };
                    }
                    break;
                case 'Mixed':
                    query[param] = { $ne: null };
                    break;
                case 'Date':
                    query[param] = query[param];
                    break;
                default:
                    query[param] = query[param];

                }
            } else if (param === 'env') {
                query[param] = {
                    $in: query[param].split(',')
                };
            }

        });
        if (ids.length > 0 || collection || favourite) {
            query._id = {
                $in: ids
            };
        }
        logger.info(query);
        return query;
    }

    static getFilteredSort(sort) {
        const sortParams = sort.split(',');
        const filteredSort = {};
        const layerAttributes = Object.keys(Layer.schema.obj);
        sortParams.forEach((param) => {
            let sign = param.substr(0, 1);
            let realParam = param.substr(1);
            if (sign !== '-') {
                sign = '+';
                realParam = param;
            }
            if (layerAttributes.indexOf(realParam) >= 0) {
                filteredSort[realParam] = parseInt(sign + 1, 10);
            }
        });
        return filteredSort;
    }

    static async get(id, includes) {
        logger.debug(`[LayerService]: Getting layer with id:  ${id}`);
        logger.info(`[DBACCESS-FIND]: layer.id: ${id}`);
        const layer = await Layer.findById(id).exec() || await Layer.findOne({
            slug: id
        }).exec();
        if (!layer) {
            logger.error(`[LayerService]: Layer with id ${id} doesn't exist`);
            throw new LayerNotFound(`Layer with id '${id}' doesn't exist`);
        }
        if (includes && includes.length > 0) {
            logger.debug('Finding relationships');
            const layers = await RelationshipsService.getRelationships([layer], includes);
            return layers[0];
        }
        return layer;
    }

    static async create(layer, dataset, user) {
        logger.debug(`[LayerService]: Getting layer with name:  ${layer.name}`);
        logger.info(`[DBACCES-FIND]: layer.name: ${layer.name}`);
        const tempSlug = await LayerService.getSlug(layer.name);

        logger.info(`[DBACCESS-SAVE]: layer.name: ${layer.name}`);
        const newLayer = await new Layer({
            name: layer.name,
            slug: tempSlug,
            type: layer.type,
            dataset,
            description: layer.description,
            application: layer.application,
            iso: layer.iso,
            provider: layer.provider,
            default: layer.default,
            published: layer.published,
            protected: layer.protected,
            userId: user.id,
            env: layer.env || 'production',
            layerConfig: layer.layerConfig,
            legendConfig: layer.legendConfig,
            interactionConfig: layer.interactionConfig,
            applicationConfig: layer.applicationConfig,
            staticImageConfig: layer.staticImageConfig
        }).save();
        logger.debug('[LayerService]: Creating in graph');
        return newLayer;
    }

    static async update(id, layer) {
        logger.debug(`[LayerService]: Getting layer with id:  ${id}`);
        logger.info(`[DBACCESS-FIND]: layer.id: ${id}`);
        const currentLayer = await Layer.findById(id).exec() || await Layer.findOne({
            slug: id
        }).exec();
        if (!currentLayer) {
            logger.error(`[LayerService]: Layer with id ${id} doesn't exist`);
            throw new LayerNotFound(`Layer with id '${id}' doesn't exist`);
        }
        currentLayer.name = layer.name || currentLayer.name;
        currentLayer.description = layer.description || currentLayer.description;
        currentLayer.application = layer.application || currentLayer.application;
        currentLayer.iso = layer.iso || currentLayer.iso;
        currentLayer.provider = layer.provider || currentLayer.provider;
        currentLayer.type = layer.type || currentLayer.type;
        currentLayer.provider = layer.provider || currentLayer.provider;
        currentLayer.default = layer.default !== undefined ? layer.default : currentLayer.default;
        currentLayer.published = layer.published !== undefined ? layer.published : currentLayer.published;
        currentLayer.type = layer.type || currentLayer.type;
        currentLayer.layerConfig = layer.layerConfig || currentLayer.layerConfig;
        currentLayer.legendConfig = layer.legendConfig || currentLayer.legendConfig;
        currentLayer.interactionConfig = layer.interactionConfig || currentLayer.interactionConfig;
        currentLayer.applicationConfig = layer.applicationConfig || currentLayer.applicationConfig;
        currentLayer.staticImageConfig = layer.staticImageConfig || currentLayer.staticImageConfig;
        currentLayer.updatedAt = new Date();
        if (layer.protected === false || layer.protected === true) {
            currentLayer.protected = layer.protected;
        }
        logger.info(`[DBACCESS-SAVE]: layer`);
        const newLayer = await currentLayer.save();

        try {
            await LayerService.expireCacheTiles(id, currentLayer._id);
        } catch (err) {
            logger.error('Error removing metadata of the layer', err);
        }
        return newLayer;
    }

    static async updateEnvironment(dataset, env) {
        logger.debug('Updating layers with dataset', dataset);
        const layers = await Layer.find({
            dataset
        }).exec();
        await Layer.update({ dataset }, { $set: { env } }, { multi: true });
        return layers;
    }

    static async delete(id) {
        logger.debug(`[LayerService]: Getting layer with id:  ${id}`);
        logger.info(`[DBACCESS-FIND]: layer.id: ${id}`);
        const currentLayer = await Layer.findById(id).exec() || await Layer.findOne({
            slug: id
        }).exec();
        if (!currentLayer) {
            logger.error(`[LayerService]: Layer with id ${id} doesn't exist`);
            throw new LayerNotFound(`Layer with id '${id}' doesn't exist`);
        }
        if (currentLayer.protected) {
            logger.error(`[LayerService]: Layer with id ${id} is protected`);
            throw new LayerProtected(`Layer is protected`);
        }
        logger.info(`[DBACCESS-DELETE]: layer.id: ${id}`);
        const deletedLayer = await currentLayer.remove();
        logger.debug('[LayerService]: Deleting in graph');
        try {
            await LayerService.expireCacheTiles(id, currentLayer._id);
        } catch (err) {
            logger.error('Error expirating cache', err);
        }
        try {
            await LayerService.deleteMedadata(id, currentLayer._id);
        } catch (err) {
            logger.error('Error removing metadata of the layer', err);
        }
        return deletedLayer;
    }

    static async deleteByDataset(id) {
        logger.debug(`[LayerService]: Getting layers of dataset with id:  ${id}`);
        logger.info(`[DBACCESS-FIND]: dataset.id: ${id}`);
        const layers = await Layer.find({
            dataset: id
        }).exec();
        if (layers) {
            for (let i = 0, length = layers.length; i < length; i++) {
                const currentLayer = layers[i];
                logger.info(`[DBACCESS-DELETE]: layer.id: ${id}`);
                await currentLayer.remove();
                logger.debug('[LayerService]: Deleting in graph');
                try {
                    await GraphService.deleteLayer(id);
                } catch (err) {
                    logger.error('Error removing layer of the graph', err);
                }
                try {
                    await LayerService.deleteMedadata(id, currentLayer._id);
                } catch (err) {
                    logger.error('Error removing metadata of the layer', err);
                }
                try {
                    await LayerService.expireCacheTiles(id, currentLayer._id);
                } catch (err) {
                    logger.error('Error expirating cache', err);
                }
            }
        }
        return layers;
    }

    static async expireCacheTiles(layerId) {
        logger.debug('Expirating cache of tiles');
        await ctRegisterMicroservice.requestToMicroservice({
            uri: `/layer/${layerId}/expire-cache`,
            method: 'DELETE'
        });
    }

    static async deleteMedadata(datasetId, layerId) {
        logger.debug('Removing metadata of the layer');
        await ctRegisterMicroservice.requestToMicroservice({
            uri: `/dataset/${datasetId}/layer/${layerId}/metadata`,
            method: 'DELETE'
        });
    }

    static async getAll(query = {}, dataset = null) {
        logger.debug(`[LayerService]: Getting all layers`);
        const sort = query.sort || '';
        const page = query['page[number]'] ? parseInt(query['page[number]'], 10) : 1;
        const limit = query['page[size]'] ? parseInt(query['page[size]'], 10) : 10;
        const ids = query.ids ? query.ids.split(',').map(elem => elem.trim()) : [];
        const includes = query.includes ? query.includes.split(',').map(elem => elem.trim()) : [];
        if (dataset) {
            query.dataset = dataset;
        }
        const filteredQuery = LayerService.getFilteredQuery(Object.assign({}, query), ids);
        const filteredSort = LayerService.getFilteredSort(sort);
        const options = {
            page,
            limit,
            sort: filteredSort
        };
        logger.info(`[DBACCESS-FIND]: layer`);
        let pages = await Layer.paginate(filteredQuery, options);
        pages = Object.assign({}, pages);
        if (includes.length > 0) {
            logger.debug('Finding relationships');
            pages.docs = await RelationshipsService.getRelationships(pages.docs, includes);
        }
        return pages;
    }

    static async getByDataset(resource) {
        logger.debug(`[LayerService] Getting layers for datasets with ids ${resource.ids}`);
        if (resource.app) {
            if (resource.app.indexOf('@') >= 0) {
                resource.app = {
                    $all: resource.app.split('@').map(elem => elem.trim())
                };
            } else {
                resource.app = {
                    $in: resource.app.split(',').map(elem => elem.trim())
                };
            }
        }
        const query = {
            dataset: {
                $in: resource.ids
            }
        };
        if (resource.app) {
            query.application = resource.app;
        }
        logger.debug(`[LayerService] IDs query: ${JSON.stringify(query)}`);
        return await Layer.find(query).exec();
    }

    static async hasPermission(id, user) {
        let permission = true;
        const layer = await LayerService.get(id);
        const appPermission = layer.application.find(layerApp =>
            user.extraUserData.apps.find(app => app === layerApp)
        );
        if (!appPermission) {
            permission = false;
        }
        if ((user.role === 'MANAGER') && (!layer.userId || layer.userId !== user.id)) {
            permission = false;
        }
        return permission;
    }

}

module.exports = LayerService;
