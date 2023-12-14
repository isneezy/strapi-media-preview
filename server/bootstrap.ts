import { Strapi } from "@strapi/strapi";
import generator from "./generator/thubmnail-generator";
import { migrate } from './migration'

export default async function bootstrap({ strapi }: { strapi: Strapi }) {    
    strapi.db?.lifecycles.subscribe({
        async beforeCreate(event) {
            if (event.model.singularName !== 'file') return
            const { mime } = event.params.data
            if (!generator.isFormatSupported(mime)) return
            const formats = await generator.generate(event.params.data)
            event.params.data.formats = formats
        }
    })

    process.nextTick(migrate)
}