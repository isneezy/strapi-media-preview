import { Strapi } from '@strapi/strapi';
import path from 'path';
import { writeFile, } from 'fs/promises';
import { createReadStream } from 'fs';
import { pdf } from 'pdf-to-img';
import _ from 'lodash'

type FileType = File & { path: string }

const SUPPORTED_MIME_TYPES = ['application/pdf']

async function generateScreenShotOfThePage(fileData: any, image: Buffer) {
    const { getDimensions } = strapi.plugin('upload').service('image-manipulation')
    const uploadService = strapi.plugin('upload').service('upload')
    const imageFileName = [path.parse(fileData.name).name, 'jpeg'].join('.')
    const tmpImageFilePath = path.resolve(fileData.tmpWorkingDirectory, imageFileName)
    await writeFile(tmpImageFilePath, image)
    let file = {
        ...fileData,
        name: imageFileName,
        path: tmpImageFilePath,
        ext: '.jpeg',
        mime: 'image/jpeg',
        getStream: () => createReadStream(tmpImageFilePath)
    }
    // Store width and height of the original image
    const { width, height } = await getDimensions(file);
    _.assign(file, { width, height })
    file = await uploadService.enhanceAndValidateFile(file)

    // workaround to keep the hash the same with the document
    _.assign(file, { hash: fileData.hash })

    return file
}


export default ({ strapi }: { strapi: Strapi }) => {
    strapi.db?.lifecycles.subscribe({
        async beforeCreate(event) {
            if (event.model.singularName !== 'file') return
            const { mime } = event.params.data
            if (!SUPPORTED_MIME_TYPES.includes(mime)) return
            const uploadProvider = strapi.plugin('upload').service('provider')
            const { isResizableImage, generateThumbnail, generateResponsiveFormats } = strapi.plugin('upload').service('image-manipulation')
            const document = await pdf(event.params.data.getStream(), { scale: 1 })

            for await (const image of document) {
                const file = await generateScreenShotOfThePage(event.params.data, image)
                const uploadPromises: Promise<any>[] = []

                const uploadThumnail = async (thumbnailFile: any) => {
                    try {
                        await uploadProvider.upload(thumbnailFile)
                        _.set(event.params.data, 'formats.thumbnail', thumbnailFile)
                    } catch (error: any) {
                        strapi.log.warn('Failed to upload thumbnail image format:', error)
                        console.error(error)
                    }
                }

                const uploadResponsiveFormat = async (format: { key: string, file: any }) => {
                    const { key, file } = format
                    try {
                        await uploadProvider.upload(file)
                        _.set(event.params.data, ['formats', key], file)
                    } catch (error: any) {
                        strapi.log.warn(`Failed to upload ${key} image format:`, error)
                        console.error(error)
                    }
                }

                // Generate & Upload thumbnail and responsive formats
                if (await isResizableImage(file)) {
                    const thumbnail = await generateThumbnail(file)
                    if (thumbnail) uploadPromises.push(uploadThumnail(thumbnail))
                    const formats = await generateResponsiveFormats(file)
                    if (Array.isArray(formats) && formats.length > 0) {
                        formats.forEach(format => {
                            if (!format) return
                            uploadPromises.push(uploadResponsiveFormat(format));
                        })
                    }
                }

                await Promise.all(uploadPromises)
                console.log(JSON.stringify(event.params.data, null, 2))
                break;
            }
        }
    })
}