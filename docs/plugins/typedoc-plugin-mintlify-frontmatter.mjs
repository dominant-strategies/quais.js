// @ts-check
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

/**
 * This plugin adds a title and description to the frontmatter of each markdown page for compliance with Mintlify.
 *
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
    app.renderer.on(
        MarkdownPageEvent.BEGIN,
        /**
         * @param {import('typedoc-plugin-markdown').MarkdownPageEvent} page
         */
        (page) => {
            const iconLetter = page.url.charAt(0);
            const icon = 'square-' + iconLetter;
            page.frontmatter = {
                title: page.model?.name,
                icon: icon,
                iconType: "solid",
                ...page.frontmatter,
            };
        },
    );
}
