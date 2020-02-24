
class LayerSerializer {

    static serializeElement(el) {
        return {
            id: el._id,
            type: 'layer',
            attributes: {
                name: el.name,
                slug: el.slug,
                dataset: el.dataset,
                description: el.description,
                application: el.application,
                iso: el.iso,
                provider: el.provider,
                default: el.default,
                protected: el.protected,
                published: el.published,
                env: el.env,
                layerConfig: el.layerConfig || {},
                legendConfig: el.legendConfig || {},
                interactionConfig: el.interactionConfig || {},
                applicationConfig: el.applicationConfig || {},
                staticImageConfig: el.staticImageConfig || {},
                updatedAt: el.updatedAt,
                user: el.user
            }
        };
    }

    static serialize(data, link = null, forceArray = false) {
        const result = {};
        if (data) {
            if (data.docs) {
                result.data = data.docs.map(el => LayerSerializer.serializeElement(el));
            } else {
                if (Array.isArray(data)) {
                    if (data.length === 1 && !forceArray) {
                        result.data = LayerSerializer.serializeElement(data[0]);
                    } else {
                        result.data = data.map(el => LayerSerializer.serializeElement(el));
                    }
                } else {
                    result.data = LayerSerializer.serializeElement(data);
                }
            }
        }
        if (link) {
            result.links = {
                self: `${link}page[number]=${data.page}&page[size]=${data.limit}`,
                first: `${link}page[number]=1&page[size]=${data.limit}`,
                last: `${link}page[number]=${data.pages}&page[size]=${data.limit}`,
                prev: `${link}page[number]=${data.page - 1 > 0 ? data.page - 1 : data.page}&page[size]=${data.limit}`,
                next: `${link}page[number]=${data.page + 1 < data.pages ? data.page + 1 : data.pages}&page[size]=${data.limit}`,
            };
            result.meta = {
                'total-pages': data.pages,
                'total-items': data.total,
                size: data.limit
            };
        }
        return result;
    }

}

module.exports = LayerSerializer;
