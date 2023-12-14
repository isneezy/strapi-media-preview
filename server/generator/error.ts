export class UnsupportedFileFormat extends Error {
    constructor(format: string) {
        super(`File format '${format}' is not supported`)
    }
}

export class FaultyDocumentError extends Error {
    constructor() {
        super(`Invalid or corrupted document format.`)
    }
}

export class UnsupportedURL extends Error {
    constructor(url: string) {
        super(`Unsupported url ${url}`)
    }
}