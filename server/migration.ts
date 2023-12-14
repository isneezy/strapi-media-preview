import logger from "./logger"
import generator from "./generator/thubmnail-generator"

export async function migrate() {
    logger.info('Running migration for preview image generation. Checking existing uploads...')
    const uploadService = strapi.plugin('upload').service('upload')
    const filters = {
        mime: {
            $in: generator.getSupportedFormats()
        },
        formats: {
            $notNull: false
        }
    }

    const uploads = await uploadService.findMany({ filters })

    if (!Array.isArray(uploads) || uploads.length === 0) {
        logger.info('No File uploads found for preview image generation. Nothing to process.')
        return
    }

    logger.debug(`Found ${uploads.length} supported file(s) with no media formats/previews`)

    const promissesArray = uploads.map(async upload => {
        try {
            logger.debug(`Generating thumbnails for upload file ${upload.name}`)
            const formats = await generator.generate(upload)
            upload.formats = formats
            uploadService.update(upload.id, upload)
            return true
        } catch (error: any) {
            logger.warn(`Failed to generate thumnails for file upload ${upload.name}`, error)
            return false
        }
    })

    const migrationResouts = await Promise.allSettled(promissesArray)
    const stats = migrationResouts.reduce((value, result) => {
        if (result.status === 'fulfilled') {
            value.total += 1
            if (result.value === true) value.successful += 1
            else value.failed += 1
        }
        return value
    }, { total: 0, successful: 0, failed: 0 })

    logger.info(
        `Migration for preview image generation completed.
    Total upload files processed: ${stats.total}
    Successful migrations: ${stats.successful}
    Failed migrations: ${stats.failed}`
    )
}