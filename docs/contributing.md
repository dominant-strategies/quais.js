# Contributions and Hacking

Pull requests are welcome, but please keep the following in mind:

-   Backwards-compatibility-breaking changes will not be accepted; they may be considered for the next major version
-   Security is important; adding dependencies require fairly convincing arguments as to why
-   The library aims to be lean, so keep an eye on the `dist/quais.min.js` file size before and after your changes (the `build-clean` target includes these stats)
-   Keep the PR simple, readable and confined to the relevant files; see below for which files to change
-   Add test cases for both expected and unexpected input
-   Any new features that are overly complicated or specific may not be accepted
-   Everyone is working hard; **be kind and respectful**

It is always _highly recommended_ that you start a conversation in the [Quai Developer Discord](https://discord.gg/s8y8asPwNC) **before** beginning a PR.

## Documentation

The documentation is an area which can always benefit from extra eyes, extra knowledge and extra examples.

Contributing to the documentation is welcome, but when making changes to documentation, please ensure that all changes are made **only** to:

-   Updating `/docs/*\*.md`
-   Updating API jsdocs: `/*\* ... */` comment blocks within `/src/`

All changes should be in the JSdoc/TypeDoc format and comply with [Mintlify Standards](https://mintlify.com/docs/page).

### Fixing Bugs

In general the **only** files you should ever include in a PR are:

-   TypeScript source: `/src/*\*.ts`

Do not include a `package.json` with the updated `tarballHash` or `version`, and do not include any generated files in your PR.

A bug fix **must not** modify anything requiring a minor version bump, such as changing a method signature or altering the exports.

### Adding Features

Contributing new features usually require a deeper understanding of the internal interactions with quais and its components, and generally requires a minor version bump.

When making any of the following changes, you must first start a conversation in the [Quai Developer Discord](https://discord.gg/s8y8asPwNC) as the minor version will need to be bumped.

-   any signature change (such as adding a parameter, changing a parameter type, changing the return type)
-   adding any new export; such as a class, function or constants
-   adding any method to any class
-   changing any `exports` property within the `package.json`

Changes of this sort should not be made without serious consideration
and discussion.
