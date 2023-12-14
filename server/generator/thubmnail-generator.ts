import { UnsupportedFileFormat, UnsupportedURL } from "./error"
import pdfProvider from "./pdf-provider"
import { AbstractGenerator, AbstractGeneratorProvider, FileType } from "."
import os from 'os'
import fse from 'fs-extra'
import fs from 'fs'
import fsAsync from 'fs/promises'
import path from "path"
import _ from "lodash"
import logger from "../logger"

async function ensureTmpWorkingDirectory(fileData: FileType): Promise<boolean> {
    // create and assign a temporary working directory
    if (!fileData.tmpWorkingDirectory) {
        const tmpWorkingDirectory = await fse.mkdtemp(path.resolve(os.tmpdir(), 'strapi-upload-'))
        fileData.tmpWorkingDirectory = tmpWorkingDirectory
        return true
    }

    return false
}

async function ensureGetStream(fileData: FileType) {
    if (fileData.getStream) {
        const streamPromise = Promise.resolve(fileData.getStream())
        fileData.getStreamAsync = () => streamPromise
    }
    if (fileData.provider === 'local') {
        const publicDir = strapi.dirs.static.public
        const relativePathToFile = path.join(publicDir, fileData.url)
        const absolutePathToFile = path.resolve(strapi.dirs.app.root, relativePathToFile)
        fileData.getStreamAsync = async () => fs.createReadStream(absolutePathToFile)
    } else {
        throw new UnsupportedURL(fileData.url)
    }
}

async function createTmpImageFileUpload(fileData: FileType, image: Buffer): Promise<FileType> {
    const { getDimensions } = strapi.plugin('upload').service('image-manipulation')
    const file = _.cloneDeep(fileData)
    const ext = '.jpeg'
    const mime = 'image/jpeg'
    const name = [path.parse(fileData.name).name, ext].join('')
    const tmpImageFilePath = path.resolve(fileData.tmpWorkingDirectory, name)
    await fsAsync.writeFile(tmpImageFilePath, image)
    file.getStream = () => fs.createReadStream(tmpImageFilePath)

    const { width, height } = await getDimensions(file);
    _.assign(file, { name, ext, mime, width, height })

    return file
}

class TumbnailGenerator extends AbstractGenerator {
    private providers: AbstractGeneratorProvider[] = []

    public registerProvider(provider: AbstractGeneratorProvider) {
        this.providers.push(provider)
    }

    getSupportedFormats(): string[] {
        return this.providers.reduce((formats, provider) => {
            return formats.concat(provider.getSupportedFormats())
        }, [] as string[])
    }

    private getProvider(format: string): AbstractGeneratorProvider | undefined {
        return this.providers.reduce((value, provider) => {
            if (value) return value
            if (provider.isFormatSupported(format)) return provider
        }, undefined as AbstractGeneratorProvider | undefined)
    }

    async generate(_fileData: FileType): Promise<FileType['formats']> {
        const fileData = _.cloneDeep(_fileData)
        const { mime } = fileData
        if (!this.isFormatSupported(mime)) throw new UnsupportedFileFormat(mime)
        const uploadProvider = strapi.plugin('upload').service('provider')
        const { isResizableImage, generateThumbnail, generateResponsiveFormats } = strapi.plugin('upload').service('image-manipulation')
        const provider = this.getProvider(mime) as AbstractGeneratorProvider
        // TODO delete the tmpWorkingDirectory if true
        const tmpWorkingDirectoryCreated = await ensureTmpWorkingDirectory(fileData)
        await ensureGetStream(fileData)
        const image = await provider.generate(fileData)
        const tmpFileUpload = await createTmpImageFileUpload(fileData, image)

        const uploadPromises: Promise<any>[] = []

        const uploadThumnail = async (thumbnailFile: any) => {
            try {
                await uploadProvider.upload(thumbnailFile)
                _.set(_fileData, 'formats.thumbnail', thumbnailFile)
            } catch (error: any) {
                logger.warn('Failed to upload thumbnail image format:', error)
            }
        }

        const uploadResponsiveFormat = async (format: { key: string, file: any }) => {
            const { key, file } = format
            try {
                await uploadProvider.upload(file)
                _.set(_fileData, ['formats', key], file)
            } catch (error: any) {
                logger.warn(`Failed to upload ${key} image format:`, error)
            }
        }

        // Generate & Upload thumbnail and responsive formats
        if (await isResizableImage(tmpFileUpload)) {
            const thumbnail = await generateThumbnail(tmpFileUpload)
            if (thumbnail) uploadPromises.push(uploadThumnail(thumbnail))
            const formats = await generateResponsiveFormats(tmpFileUpload)
            if (Array.isArray(formats) && formats.length > 0) {
                formats.forEach(format => {
                    if (!format) return
                    uploadPromises.push(uploadResponsiveFormat(format));
                })
            }
        }

        try {
            await Promise.all(uploadPromises)
            return _fileData.formats
        } finally {
            await fsAsync.rm(tmpFileUpload.tmpWorkingDirectory, { force: true, recursive: true })
        }
    }
}

const generator = new TumbnailGenerator()
generator.registerProvider(pdfProvider)



export default generator 
