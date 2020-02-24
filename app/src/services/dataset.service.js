const logger = require('logger');
const ctRegisterMicroservice = require('sd-ct-register-microservice-node');

class DatasetService {
    static async checkDataset(ctx) {
        if (ctx.params.dataset || ctx.request.body.dataset) {
            const datasetId = ctx.params.dataset || ctx.request.body.dataset;
            logger.info(`[DatasetService] Validating presence of dataset with id: ${datasetId}`);

            try {
                console.log("test----", ctx.headers);
                const dataset = await ctRegisterMicroservice.requestToMicroservice({
                    uri: `/dataset/${datasetId}`,
                    headers: { authentication: ctx.headers.authentication },
                    method: 'GET',
                    json: true
                });
                console.log("dataset---", dataset);
                return dataset.data;
            } catch (err) {
                console.log("err000", err);
                logger.info(`[DatasetService] There was an error obtaining the dataset: ${err}`);
                throw err;
            }
        } else {
            // If no datasets are present, it has to be catched by the validator
            logger.info(`[DatasetService] No dataset provided in this context.`);
            return null;
        }
    }

}


module.exports = DatasetService;
