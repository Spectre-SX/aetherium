# Aetherium

Aetherium is a local-first AI workspace for working with AI models, providers, plugins, and tools from one place.

It is designed to give you control over your setup without requiring an Aetherium-hosted account, centralized backend, or subscription.

## Features

- Local-first architecture
- Multiple AI provider support
- Support for different AI models
- Local profiles
- Local conversation history
- Plugin and extension support
- AI model marketplace/catalog
- Plugin marketplace/catalog
- Encrypted local application data
- Self-hostable
- Open source

## How It Works

Aetherium is designed to run locally on your machine.

Your application data is stored locally rather than being stored on an Aetherium-controlled server. This can include profiles, conversations, settings, model configurations, and other application data.

Depending on the providers and features you use, Aetherium may communicate directly with third-party services. For example, when you configure an AI provider, prompts and other information required for a request may be sent directly to that provider.

Aetherium itself does not operate a centralized service for storing your conversations or application data.

## Data Storage

Aetherium stores its local application data in the user's application data directory.

The application uses:

```
/user/(user)/ProgramFiles/aetherium
```

for local Aetherium data.

Application data stored there is encrypted.

The exact location may vary depending on the operating system and installation.

## AI Providers

Aetherium can work with third-party AI providers.

Depending on your configuration, supported providers may include services such as:

- OpenAI
- Anthropic
- Google
- Other supported providers

You are responsible for your own API keys and provider accounts.

Aetherium is not affiliated with, endorsed by, or officially connected with any third-party provider unless explicitly stated.

Using a provider through Aetherium is subject to that provider's own terms, policies, pricing, and privacy practices.

## Marketplace

Aetherium includes marketplaces/catalogs for plugins, models, and other resources.

The marketplace is primarily a directory of third-party projects and repositories. Aetherium does not necessarily host or maintain the software, models, or plugins listed there.

A listing does not mean that Aetherium has:

- Created the project
- Reviewed its source code
- Audited its security
- Tested it
- Endorsed its developer
- Guaranteed its compatibility
- Guaranteed its safety

Always check a project's repository, license, documentation, permissions, and source code before installing or using it.

**Third-party content is used at your own risk.**

## Plugins

Plugins can extend Aetherium's functionality.

Because plugins may execute code, access local data, or communicate with external services, only install plugins that you trust.

Before installing a plugin, review its repository and understand what it does.

Aetherium does not guarantee that third-party plugins are safe, secure, reliable, or free from malicious code.

## AI Models

AI models may be provided through third-party repositories or services.

Models can have different licenses, restrictions, and requirements.

Before using a model, check its license and make sure its terms allow the way you intend to use it.

## Privacy

Aetherium is designed around local storage and self-hosting.

There is no requirement for an Aetherium-hosted account or centralized backend for the core application.

Aetherium does not intentionally collect your conversations, prompts, local application data, or usage telemetry through a centralized Aetherium backend.

Third-party services you connect to may receive information when you use them. Plugins and other third-party software may also have their own data practices.

For more information, see:

- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)

## Installation

Aetherium currently supports Windows installers in the following formats:

- NSIS
- MSI

Download the appropriate installer from the project's GitHub Releases page.

After installation, launch Aetherium from the installed application.

## Development

### Requirements

You will need:

- [Node.js](https://nodejs.org/)
- npm

Clone the repository:

```
git clone https://github.com/Spectre-SX/aetherium.git
cd aetherium
```

Install dependencies:

```
npm install
```

Start the development server:

```
npm run dev
```

Build the project:

```
npm run build
```

The exact development commands and requirements may change as Aetherium continues to develop.

## Contributing

Contributions are welcome.

Before submitting a pull request:

1. Make sure the project still builds.
2. Test the changes you made.
3. Keep changes focused on what you're working on.
4. Do not include private information, credentials, API keys, or local user data.
5. Follow the existing structure and conventions of the project.

For marketplace submissions, make sure you have the right to submit the repository or resource you're listing and provide accurate information about it.

## License

Aetherium is open source.

The source code is distributed under the license included in this repository.

See [LICENSE](LICENSE) for the full license text.

Third-party plugins, models, libraries, and other resources may have their own licenses. Their respective licenses continue to apply.

## Disclaimer

Aetherium is provided as-is.

AI-generated content can be incorrect, incomplete, outdated, or inappropriate. Do not blindly rely on AI-generated information, recommendations, instructions, or other output.

You are responsible for how you use Aetherium, the providers you connect to, the models you run, and the third-party software you install.

## Links

- [Aetherium GitHub Repository](https://github.com/Spectre-SX/aetherium)
- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)

---

**Aetherium**

Local. Open. Yours.
