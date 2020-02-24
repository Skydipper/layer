const Router = require('koa-router');
const logger = require('logger');
const LayerService = require('services/layer.service');
const DatasetService = require('services/dataset.service');
const RelationshipsService = require('services/relationships.service');
const LayerValidator = require('validators/layer.validator');
const LayerSerializer = require('serializers/layer.serializer');
const LayerDuplicated = require('errors/layerDuplicated.error');
const LayerNotFound = require('errors/layerNotFound.error');
const LayerProtected = require('errors/layerProtected.error');
const LayerNotValid = require('errors/layerNotValid.error');
const USER_ROLES = require('app.constants').USER_ROLES;

const router = new Router({});

const serializeObjToQuery = obj => Object.keys(obj).reduce((a, k) => {
    a.push(`${k}=${encodeURIComponent(obj[k])}`);
    return a;
}, []).join('&');

class LayerRouter {

    static getUser(ctx) {
        let user = Object.assign({}, ctx.request.query.loggedUser ? JSON.parse(ctx.request.query.loggedUser) : {}, ctx.request.body.loggedUser);
        if (ctx.request.body.fields) {
            user = Object.assign(user, JSON.parse(ctx.request.body.fields.loggedUser));
        }
        return user;
    }

    static async get(ctx) {
        const id = ctx.params.layer;
        logger.info(`[LayerRouter] Getting layer with id: ${id}`);
        const includes = ctx.query.includes ? ctx.query.includes.split(',').map(elem => elem.trim()) : [];
        const query = ctx.query;
        delete query.loggedUser;
        try {
            const layer = await LayerService.get(id, includes);
            ctx.body = LayerSerializer.serialize(layer);
            const cache = [id, layer.slug];
            if (includes) {
                includes.forEach((inc) => {
                    cache.push(`${id}-${inc}`);
                    cache.push(`${layer.slug}-${inc}`);
                });
            }
            ctx.set('cache', cache.join(' '));
        } catch (err) {
            if (err instanceof LayerNotFound) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

    static async create(ctx) {
        logger.info(`[LayerRouter] Creating layer with name: ${ctx.request.body.name}`);
        try {
            const dataset = ctx.params.dataset;
            const user = LayerRouter.getUser(ctx);
            const layer = await LayerService.create(ctx.request.body, dataset, user);
            ctx.set('cache-control', 'flush');
            ctx.body = LayerSerializer.serialize(layer);

            ctx.set('uncache', ['layer', `${ctx.state.dataset.id}-layer`, `${ctx.state.dataset.attributes.slug}-layer`, `${ctx.state.dataset.id}-layer-all`]);

        } catch (err) {
            if (err instanceof LayerDuplicated) {
                ctx.throw(400, err.message);
                return;
            }
            throw err;
        }
    }

    static async update(ctx) {
        const id = ctx.params.layer;
        logger.info(`[LayerRouter] Updating layer with id: ${id}`);
        try {
            const layer = await LayerService.update(id, ctx.request.body);
            ctx.set('cache-control', 'flush');
            ctx.body = LayerSerializer.serialize(layer);
            ctx.set('uncache', ['layer', id, layer.slug, `${layer.dataset}-layer`, `${ctx.state.dataset.attributes.slug}-layer`, `${ctx.state.dataset.id}-layer-all`]);
        } catch (err) {
            if (err instanceof LayerNotFound) {
                ctx.throw(404, err.message);
                return;
            } else if (err instanceof LayerDuplicated) {
                ctx.throw(400, err.message);
                return;
            }
            throw err;
        }
    }

    static async delete(ctx) {
        const id = ctx.params.layer;
        logger.info(`[LayerRouter] Deleting layer with id: ${id}`);
        try {
            const layer = await LayerService.delete(id);
            ctx.set('cache-control', 'flush');
            ctx.body = LayerSerializer.serialize(layer);
            ctx.set('uncache', ['layer', id, layer.slug, `${layer.dataset}-layer`, `${ctx.state.dataset.attributes.slug}-layer`, `${ctx.state.dataset.id}-layer-all`]);
        } catch (err) {
            if (err instanceof LayerNotFound) {
                ctx.throw(404, err.message);
                return;
            }
            if (err instanceof LayerProtected) {
                ctx.throw(400, err.message);
                return;
            }
            throw err;
        }
    }

    static async deleteByDataset(ctx) {
        const id = ctx.params.dataset;
        logger.info(`[LayerRouter] Deleting layers of dataset with id: ${id}`);
        try {
            const layers = await LayerService.deleteByDataset(id);
            ctx.set('cache-control', 'flush');
            ctx.body = LayerSerializer.serialize(layers);
            const uncache = ['layer', `${ctx.state.dataset.id}-layer`, `${ctx.state.dataset.attributes.slug}-layer`, `${ctx.state.dataset.id}-layer-all`];
            if (layers) {
                layers.forEach((layer) => {
                    uncache.push(layer._id);
                    uncache.push(layer.slug);
                });
            }
            ctx.set('uncache', uncache.join(' '));
        } catch (err) {
            if (err instanceof LayerNotFound) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

    static async getAll(ctx) {
        logger.info(`[LayerRouter] Getting all layers`);
        const query = ctx.query;
        const dataset = ctx.params.dataset || null;
        const userId = ctx.query.loggedUser && ctx.query.loggedUser !== 'null' ? JSON.parse(ctx.query.loggedUser).id : null;
        delete query.loggedUser;
        if (Object.keys(query).find(el => el.indexOf('collection') >= 0)) {
            if (!userId) {
                ctx.throw(403, 'Collection filter not authorized');
                return;
            }
            logger.debug('Obtaining collections', userId);
            ctx.query.ids = await RelationshipsService.getCollections(ctx.query.collection, userId);
            ctx.query.ids = ctx.query.ids.length > 0 ? ctx.query.ids.join(',') : '';
            logger.debug('Ids from collections', ctx.query.ids);
        }
        if (Object.keys(query).find(el => el.indexOf('favourite') >= 0)) {
            if (!userId) {
                ctx.throw(403, 'Fav filter not authorized');
                return;
            }
            const app = ctx.query.app || ctx.query.application || 'rw';
            ctx.query.ids = await RelationshipsService.getFavorites(app, userId);
            ctx.query.ids = ctx.query.ids.length > 0 ? ctx.query.ids.join(',') : '';
            logger.debug('Ids from collections', ctx.query.ids);
        }
        // Links creation
        const clonedQuery = Object.assign({}, query);
        delete clonedQuery['page[size]'];
        delete clonedQuery['page[number]'];
        delete clonedQuery.ids;
        const serializedQuery = serializeObjToQuery(clonedQuery) ? `?${serializeObjToQuery(clonedQuery)}&` : '?';
        const apiVersion = ctx.mountPath.split('/')[ctx.mountPath.split('/').length - 1];
        const link = `${ctx.request.protocol}://${ctx.request.host}/${apiVersion}${ctx.request.path}${serializedQuery}`;
        const layers = await LayerService.getAll(query, dataset);
        ctx.body = LayerSerializer.serialize(layers, link);

        const includes = ctx.query.includes ? ctx.query.includes.split(',').map(elem => elem.trim()) : [];
        const cache = ['layer'];
        if (ctx.params.dataset) {
            cache.push(`${ctx.params.dataset}-layer-all`);
        }
        if (includes) {
            includes.forEach((inc) => {
                cache.push(`layer-${inc}`);
                if (ctx.params.dataset) {
                    cache.push(`${ctx.params.dataset}-layer-all-${inc}`);
                }
            });
        }
        ctx.set('cache', cache.join(' '));
    }

    static async getByIds(ctx) {
        if (ctx.request.body.layer) {
            ctx.request.body.ids = ctx.request.body.layer.ids;
        }
        if (!ctx.request.body.ids) {
            ctx.throw(400, 'Bad request - Missing \'ids\' from request body');
            return;
        }
        logger.info(`[LayerRouter] Getting layers for datasets with id: ${ctx.request.body.ids}`);
        const resource = {
            ids: ctx.request.body.ids,
            app: ctx.request.body.app
        };
        if (typeof resource.ids === 'string') {
            resource.ids = resource.ids.split(',').map(elem => elem.trim());
        }
        const result = await LayerService.getByDataset(resource);
        ctx.body = LayerSerializer.serialize(result, null, true);
    }

    static async updateEnvironment(ctx) {
        logger.info('Updating environment of all layers with dataset ', ctx.params.dataset, ' to environment', ctx.params.env);
        const layers = await LayerService.updateEnvironment(ctx.params.dataset, ctx.params.env);
        const uncache = ['layer', `${ctx.params.dataset}-layer`, `${ctx.state.dataset.attributes.slug}-layer`, 'dataset-layer'];
        if (layers) {
            layers.forEach((layer) => {
                uncache.push(layer._id);
                uncache.push(layer.slug);
            });
        }
        ctx.set('uncache', uncache.join(' '));
        ctx.body = '';
    }

}

const validationMiddleware = async (ctx, next) => {
    logger.info(`[LayerRouter] Validating`);
    if (ctx.request.body.layer) {
        ctx.request.body = Object.assign(ctx.request.body, ctx.request.body.layer);
        delete ctx.request.body.layer;
    }
    try {
        const newLayerCreation = ctx.request.method === 'POST';
        if (newLayerCreation) {
            await LayerValidator.validateCreation(ctx);
        } else {
            await LayerValidator.validateUpdate(ctx);
        }
    } catch (err) {
        if (err instanceof LayerNotValid) {
            ctx.throw(400, err.getMessages());
            return;
        }
        throw err;
    }
    await next();
};

const datasetValidationMiddleware = async (ctx, next) => {
    logger.info(`[LayerRouter] Validating dataset presence`);

    // supports the deprecated "layer" root object on the request
    if (ctx.request.body && ctx.request.body.layer) {
        ctx.request.body = Object.assign(ctx.request.body, ctx.request.body.layer);
        delete ctx.request.body.layer;
    }
    // END REMOVE
    try {
        ctx.state.dataset = await DatasetService.checkDataset(ctx, LayerValidator.getUser(ctx));
    } catch (err) {
        ctx.throw(err.statusCode, 'Dataset not found');
    }
    await next();
};

const isMicroserviceMiddleware = async (ctx, next) => {
    logger.debug('Checking if is a microservice');
    const user = LayerRouter.getUser(ctx);
    if (!user || user.id !== 'microservice') {
        ctx.throw(401, 'Not authorized');
        return;
    }
    await next();
};

const authorizationMiddleware = async (ctx, next) => {
    logger.info(`[LayerRouter] Checking authorization`);
    // Get user from query (delete) or body (post-patch)
    const newLayerCreation = ctx.request.method === 'POST';
    const user = LayerRouter.getUser(ctx);
    if (user.id === 'microservice') {
        await next();
        return;
    }
    if (!user || USER_ROLES.indexOf(user.role) === -1) {
        ctx.throw(401, 'Unauthorized'); // if not logged or invalid ROLE -> out
        return;
    }
    if (user.role === 'USER') {
        if (!newLayerCreation) {
            ctx.throw(403, 'Forbidden'); // if user is USER -> out
            return;
        }
    }
    const application = ctx.request.query.application ? ctx.request.query.application : ctx.request.body.application;
    if (application) {
        const appPermission = application.find(app =>
            user.extraUserData.apps.find(userApp => userApp === app)
        );
        if (!appPermission) {
            ctx.throw(403, 'Forbidden'); // if manager or admin but no application -> out
            return;
        }
    }
    const allowedOperations = newLayerCreation;
    if ((user.role === 'MANAGER' || user.role === 'ADMIN') && !allowedOperations) {
        try {
            const permission = await LayerService.hasPermission(ctx.params.layer, user);
            if (!permission) {
                ctx.throw(403, 'Forbidden');
                return;
            }
        } catch (err) {
            throw err;
        }
    }
    await next(); // SUPERADMIN is included here
};

const isMicroservice = async (ctx, next) => {
    logger.debug('Checking if the call is from a microservice');
    if (ctx.request.body && ctx.request.body.loggedUser && ctx.request.body.loggedUser.id === 'microservice') {
        await next();
    } else {
        ctx.throw(403, 'Not authorized');
    }
};

router.get('/layer', LayerRouter.getAll);
router.get('/layer/:layer', LayerRouter.get);
router.get('/dataset/:dataset/layer', datasetValidationMiddleware, LayerRouter.getAll);

router.post('/dataset/:dataset/layer', datasetValidationMiddleware, validationMiddleware, authorizationMiddleware, LayerRouter.create);
router.get('/dataset/:dataset/layer/:layer', datasetValidationMiddleware, LayerRouter.get);
router.patch('/dataset/:dataset/layer/:layer', datasetValidationMiddleware, validationMiddleware, authorizationMiddleware, LayerRouter.update);
router.delete('/dataset/:dataset/layer/:layer', datasetValidationMiddleware, authorizationMiddleware, LayerRouter.delete);
router.delete('/dataset/:dataset/layer', datasetValidationMiddleware, isMicroserviceMiddleware, LayerRouter.deleteByDataset);

router.post('/layer/find-by-ids', LayerRouter.getByIds);
router.patch('/layer/change-environment/:dataset/:env', datasetValidationMiddleware, isMicroservice, LayerRouter.updateEnvironment);

module.exports = router;
