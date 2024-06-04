// @ts-check
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

/**
 * This plugin adds a title and description to the frontmatter of each markdown page for compliance with Mintlify.
 *
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
    app.renderer.on(
        MarkdownPageEvent.END,
        /**
         * @param {import('typedoc-plugin-markdown').MarkdownPageEvent} page
         */
        (page) => {
            if (page.contents) {
                if (page.contents.includes('.mdx')) {
                  const regex = /(\.mdx)/g;
                  page.contents = page.contents.replace(regex, '');
                }
            }
        },
    );
}
