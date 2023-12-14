import { pdf } from "pdf-to-img";
import { AbstractGeneratorProvider, FileType } from ".";
import { FaultyDocumentError } from "./error";

class PdfProvider extends AbstractGeneratorProvider {
    async generate(fileData: FileType): Promise<Buffer> {
        const document = await pdf(await fileData.getStreamAsync(), { scale: 1 })
        for await (const image of document) {
            return image
        }
        throw new FaultyDocumentError()
    }
    getSupportedFormats(): string[] {
        return ['application/pdf']
    }
}

const pdfProvider = new PdfProvider()
export default pdfProvider