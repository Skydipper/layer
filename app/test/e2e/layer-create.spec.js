/* eslint-disable no-unused-vars,no-undef,no-useless-escape */
const nock = require('nock');
const chai = require('chai');
const Layer = require('models/layer.model');
const { ROLES } = require('./test.constants');
const { getTestServer } = require('./test-server');

const should = chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Layer create tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestServer();

        Layer.remove({}).exec();

        nock.cleanAll();
    });

    it('Create a layer without being authenticated should fail (401 http code)', async () => {
        const timestamp = new Date().getTime();
        const layer = {
            name: `Carto DB Layer - ${timestamp}`,
            application: ['rw']
        };

        nock(process.env.CT_URL)
            .get(`/v1/dataset/${timestamp}`)
            .reply(200, {
                data: {
                    id: timestamp,
                    type: 'dataset',
                    attributes: {
                        name: 'Uncontrolled Public-Use Airports -- U.S.',
                        slug: 'Uncontrolled-Public-Use-Airports-US_2',
                        type: null,
                        subtitle: null,
                        application: ['rw'],
                        dataPath: null,
                        attributesPath: null,
                        connectorType: 'rest',
                        provider: 'featureservice',
                        userId: '1a10d7c6e0a37126611fd7a7',
                        connectorUrl: 'https://services.arcgis.com/uDTUpUPbk8X8mXwl/arcgis/rest/services/Public_Schools_in_Onondaga_County/FeatureServer/0?f=json',
                        tableName: 'Public_Schools_in_Onondaga_County',
                        status: 'pending',
                        published: true,
                        overwrite: false,
                        verified: false,
                        blockchain: {},
                        mainDateField: null,
                        env: 'production',
                        geoInfo: false,
                        protected: false,
                        legend: { date: [], region: [], country: [], nested: [] },
                        clonedHost: {},
                        errorMessage: null,
                        taskId: null,
                        updatedAt: '2018-11-05T15:25:53.321Z',
                        dataLastUpdated: null,
                        widgetRelevantProps: [],
                        layerRelevantProps: []
                    }
                }
            });

        const response = await requester
            .post(`/api/v1/dataset/${timestamp}/layer`)
            .send({
                layer
            });

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
    });

    it('Create a layer for a dataset (layer root object) should be successful', async () => {
        const timestamp = new Date().getTime();
        const layer = {
            name: `Carto DB Layer - ${timestamp}`,
            application: ['rw']
        };

        nock(process.env.CT_URL)
            .get(`/v1/dataset/${timestamp}`)
            .reply(200, {
                data: {
                    id: timestamp,
                    type: 'dataset',
                    attributes: {
                        name: 'Uncontrolled Public-Use Airports -- U.S.',
                        slug: 'Uncontrolled-Public-Use-Airports-US_2',
                        type: null,
                        subtitle: null,
                        application: ['rw'],
                        dataPath: null,
                        attributesPath: null,
                        connectorType: 'rest',
                        provider: 'featureservice',
                        userId: '1a10d7c6e0a37126611fd7a7',
                        connectorUrl: 'https://services.arcgis.com/uDTUpUPbk8X8mXwl/arcgis/rest/services/Public_Schools_in_Onondaga_County/FeatureServer/0?f=json',
                        tableName: 'Public_Schools_in_Onondaga_County',
                        status: 'pending',
                        published: true,
                        overwrite: false,
                        verified: false,
                        blockchain: {},
                        mainDateField: null,
                        env: 'production',
                        geoInfo: false,
                        protected: false,
                        legend: { date: [], region: [], country: [], nested: [] },
                        clonedHost: {},
                        errorMessage: null,
                        taskId: null,
                        updatedAt: '2018-11-05T15:25:53.321Z',
                        dataLastUpdated: null,
                        widgetRelevantProps: [],
                        layerRelevantProps: []
                    }
                }
            });

        const response = await requester
            .post(`/api/v1/dataset/${timestamp}/layer`)
            .send({
                layer,
                loggedUser: ROLES.ADMIN
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const createdLayer = response.body.data.attributes;

        createdLayer.should.have.property('name').and.equal(`Carto DB Layer - ${timestamp}`);
        createdLayer.should.have.property('application').and.be.an('array').and.contain('rw');
        createdLayer.should.have.property('dataset').and.equal(`${timestamp}`);
        createdLayer.should.have.property('slug').and.equal(`Carto-DB-Layer-${timestamp}`);
        createdLayer.should.have.property('protected').and.equal(false);
        createdLayer.should.have.property('default').and.equal(false);
        createdLayer.should.have.property('published').and.equal(true);

        createdLayer.layerConfig.should.be.an.instanceOf(Object);
        createdLayer.legendConfig.should.be.an.instanceOf(Object);
        createdLayer.applicationConfig.should.be.an.instanceOf(Object);
        createdLayer.interactionConfig.should.be.an.instanceOf(Object);
        createdLayer.staticImageConfig.should.be.an.instanceOf(Object);
    });

    it('Create a layer for a dataset (no layer root object) should be successful', async () => {
        const timestamp = new Date().getTime();
        const layer = {
            name: `Carto DB Layer - ${timestamp}`,
            application: ['rw'],
            loggedUser: ROLES.ADMIN
        };

        nock(process.env.CT_URL)
            .get(`/v1/dataset/${timestamp}`)
            .reply(200, {
                data: {
                    id: timestamp,
                    type: 'dataset',
                    attributes: {
                        name: 'Uncontrolled Public-Use Airports -- U.S.',
                        slug: 'Uncontrolled-Public-Use-Airports-US_2',
                        type: null,
                        subtitle: null,
                        application: ['rw'],
                        dataPath: null,
                        attributesPath: null,
                        connectorType: 'rest',
                        provider: 'featureservice',
                        userId: '1a10d7c6e0a37126611fd7a7',
                        connectorUrl: 'https://services.arcgis.com/uDTUpUPbk8X8mXwl/arcgis/rest/services/Public_Schools_in_Onondaga_County/FeatureServer/0?f=json',
                        tableName: 'Public_Schools_in_Onondaga_County',
                        status: 'pending',
                        published: true,
                        overwrite: false,
                        verified: false,
                        blockchain: {},
                        mainDateField: null,
                        env: 'production',
                        geoInfo: false,
                        protected: false,
                        legend: { date: [], region: [], country: [], nested: [] },
                        clonedHost: {},
                        errorMessage: null,
                        taskId: null,
                        updatedAt: '2018-11-05T15:25:53.321Z',
                        dataLastUpdated: null,
                        widgetRelevantProps: [],
                        layerRelevantProps: []
                    }
                }
            });

        const response = await requester
            .post(`/api/v1/dataset/${timestamp}/layer`)
            .send(layer);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const createdLayer = response.body.data.attributes;

        createdLayer.should.have.property('name').and.equal(`Carto DB Layer - ${timestamp}`);
        createdLayer.should.have.property('application').and.be.an('array').and.contain('rw');
        createdLayer.should.have.property('dataset').and.equal(`${timestamp}`);
        createdLayer.should.have.property('slug').and.equal(`Carto-DB-Layer-${timestamp}`);
        createdLayer.should.have.property('protected').and.equal(false);
        createdLayer.should.have.property('default').and.equal(false);
        createdLayer.should.have.property('published').and.equal(true);

        createdLayer.layerConfig.should.be.an.instanceOf(Object);
        createdLayer.legendConfig.should.be.an.instanceOf(Object);
        createdLayer.applicationConfig.should.be.an.instanceOf(Object);
        createdLayer.interactionConfig.should.be.an.instanceOf(Object);
        createdLayer.staticImageConfig.should.be.an.instanceOf(Object);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(() => {
        Layer.remove({}).exec();
    });
});
