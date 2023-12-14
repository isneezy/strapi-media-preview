export type FileType = {
    name: string
    mime: string
    path: string
    ext: string
    height: string
    hash: string
    width: string
    url: string
    provider: 'local' | string
    getStream?: () => any
    getStreamAsync(): Promise<any>
    tmpWorkingDirectory: string
    formats: Pick<FileType, 'name'|'height'|'width'|'url'>[]
}

export abstract class AbstractGenerator {
    isFormatSupported(format: string): boolean {
        return this.getSupportedFormats().includes(format)
    }
    abstract getSupportedFormats(): string[]
}

export abstract class AbstractGeneratorProvider extends AbstractGenerator {
    abstract generate(fileData: FileType): Promise<Buffer>
}