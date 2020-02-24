const logger = require('logger');
const ctRegisterMicroservice = require('sd-ct-register-microservice-node');


class RelationshipsService {

    static async getRelationships(layers, includes, headers = {}) {
        logger.info(`Getting relationships of layers: ${layers}`);
        for (let i = 0; i < layers.length; i++) {
            try {
                if (includes.indexOf('vocabulary') > -1) {
                    const vocabularies = await ctRegisterMicroservice.requestToMicroservice({
                        uri: `/dataset/${layers[i].dataset}/layer/${layers[i]._id}/vocabulary`,
                        headers: {
                            authentication: headers.authentication,
                            authorizationms: headers.authorizationms,
                        },
                        method: 'GET',
                        json: true
                    });
                    layers[i].vocabulary = vocabularies.data;
                }
                if (includes.indexOf('user') > -1) {
                    const user = await ctRegisterMicroservice.requestToMicroservice({
                        uri: `/auth/user/find-by-ids`,
                        method: 'POST',
                        json: true,
                        headers: {
                            authentication: ctx.headers.authentication,
                            authorizationms: ctx.headers.authorizationms,
                        },
                        body: {
                            ids: [layers[i].userId]
                        },
                        version: false
                    });
                    layers[i].user = {
                        id: user.data[0]._id,
                        name: user.data[0].name || '',
                        email: user.data[0].email
                    };
                    logger.info('Layers', layers);
                }
            } catch (err) {
                logger.error(err);
            }
        }
        return layers;
    }

    static async getCollections(ids, userId) {
        try {
            const result = await ctRegisterMicroservice.requestToMicroservice({
                uri: `/collection/find-by-ids`,
                method: 'POST',
                json: true,
                body: {
                    ids,
                    userId
                }
            });
            logger.debug(result);
            return result.data.map(col => {
                return col.attributes.resources.filter(res => res.type === 'layer');
            }).reduce((pre, cur) => {
                return pre.concat(cur);
            }).map(el => el.id);
        } catch (e) {
            throw new Error(e);
        }
    }

    static async getFavorites(app, userId) {
        try {
            const result = await ctRegisterMicroservice.requestToMicroservice({
                uri: `/favourite/find-by-user`,
                method: 'POST',
                json: true,
                body: {
                    app,
                    userId
                }
            });
            logger.debug(result);
            return result.data.filter(fav => fav.attributes.resourceType === 'layer').map(el => el.attributes.resourceId);
        } catch (e) {
            throw new Error(e);
        }
    }

}

module.exports = RelationshipsService;
