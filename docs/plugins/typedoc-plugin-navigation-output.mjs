// @ts-check
import fs from 'fs';

/**
 * This plugin parses and generates a navigation file for the documentation that complies with Mintlify's navigation
 * format.
 *
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
    app.renderer.postRenderAsyncJobs.push(async (renderer) => {
        const navigation = renderer.navigation;
        if (!navigation) {
            return;
        }
        const formattedNavigation = navigation.map((group) => ({
            group: group.title,
            pages: (group.children || []).map((child) => `content/${child.url.replace('.mdx', '')}`),
        }));
        fs.writeFileSync('./docs/content/navigation.json', JSON.stringify(formattedNavigation, null, 2));
    });
}
