import { App, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';
import isSubPath from './utils/isSubPath';
import matter from "gray-matter";

interface MyPluginSettings {
	conceptsPaths: string;
	flashcardsPaths: string;
	flashcardTags: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	conceptsPaths: 'this/is/an/example/concepts/',
	flashcardsPaths: 'this/is/an/example/flashcards/',
	flashcardTags: '#flashcard/subject/gen'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async isNoFlashcardConcept(conceptFile: TAbstractFile): Promise<boolean> {
		// This function checks if a concept file has a property "no-flashcard" equal to true in its frontmatter
		if (!(conceptFile instanceof TFile)) {
			throw new Error("File is not a TFile")
		}

		const parsed = matter(await this.app.vault.cachedRead(conceptFile))
		if (!parsed.data["no-flashcard"]) {
			return false
		}

		return parsed.data["no-flashcard"] === true
	}

	isFileInConcepts(filePath: string): boolean {
		return this.settings.conceptsPaths.split(" ").some((p: string) => isSubPath(p, filePath))
	}

	getConceptPathIndex(filePath: string): number {
		return this.settings.conceptsPaths.split(" ").findIndex((p: string) => isSubPath(p, filePath))
	}

	getDepthOfConcept(file: TAbstractFile): number {
		if (!(file instanceof TFile)) {
			throw new Error("File is not a TFile")
		}

		const cache = this.app.metadataCache.getFileCache(file)

		if (!cache) {
			return 1
		}

		if (!cache.links) {
			return 1
		}

		const depths = cache.links.map((k) => {
			const f = this.app.metadataCache.getFirstLinkpathDest(k.link, file.path)
			if (!(f instanceof TFile)) {
				return 0
			}

			return this.getDepthOfConcept(f)
		})

		return Math.max(0, ...depths) + 1
	}

	async fixTagsInFlashcard(flashcardFile: TFile, conceptFile: TFile) {
		const parsed = matter(await this.app.vault.cachedRead(flashcardFile))

		if (!parsed.data.tags) {
			parsed.data.tags = [];
		}

		let needToWrite = false;
		let tagsValid = false;

		var depth: number;

		try {
			depth = this.getDepthOfConcept(conceptFile)
		} catch (e) {
			console.error("Error calculating depth of concept for file " + conceptFile.path + ": " + e)
			new Notice("Error calculating depth of concept for file " + conceptFile.path + ": " + e)
			return
		}

		for (let i = 0; i < parsed.data.tags.length; i++) {
			const flashcardTag = this.getCorrespondingFlashcardTag(conceptFile.path)
			if (parsed.data.tags[i].startsWith(flashcardTag)) {
				if (parsed.data.tags[i] !== flashcardTag + "/" + depth) {
					parsed.data.tags[i] = flashcardTag + "/" + depth
					needToWrite = true
					tagsValid = true
					break
				} else {
					tagsValid = true
				}
			}
		}

		if (!tagsValid) {
			parsed.data.tags.push(this.getCorrespondingFlashcardTag(conceptFile.path) + "/" + depth)
			needToWrite = true
		}

		if (needToWrite) {
			await this.app.vault.process(flashcardFile, () => matter.stringify(parsed.content, parsed.data))
		}
	}

	async fixFlashcardFor(flashcardFile: TFile, conceptFile: TFile) {
		const parsed = matter(await this.app.vault.cachedRead(flashcardFile))

		const expectedLinkPath = "[[" + this.app.metadataCache.fileToLinktext(conceptFile, flashcardFile.path) + "]]"

		if (parsed.data["flashcard-for"] !== expectedLinkPath) {
			parsed.data["flashcard-for"] = expectedLinkPath
			await this.app.vault.process(flashcardFile, () => matter.stringify(parsed.content, parsed.data))
		}
	}

	getFlashcardNameFromConcept(conceptName: string): string {
		return "F " + conceptName
	}

	getCorrespondingFlashcardPath(conceptPath: string): string {
		const ind = this.getConceptPathIndex(conceptPath)
		if (ind === -1) {
			throw new Error("Concept path is not in concepts paths")
		}

		return this.settings.flashcardsPaths.split(" ")[ind]
	}

	getCorrespondingFlashcardTag(conceptPath: string): string {
		const ind = this.getConceptPathIndex(conceptPath)
		if (ind === -1) {
			throw new Error("Concept path is not in concepts paths")
		}

		return this.settings.flashcardTags.split(" ")[ind]
	}

	getFlashcardsPathsArray(): string[] {
		return this.settings.flashcardsPaths.split(" ")
	}

	getConceptsPathsArray(): string[] {
		return this.settings.conceptsPaths.split(" ")
	}

	async onload() {
		await this.loadSettings();

		this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
			if (!(file instanceof TFile)) {
				return
			}

			if (!this.isFileInConcepts(file.path)) {
				return
			}

			if (await this.isNoFlashcardConcept(file)) {
				return
			}

			const flashcardPath = this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(file.name)
			const flashcardFile = this.app.vault.getAbstractFileByPath(flashcardPath)

			if (!(flashcardFile instanceof TFile)) {
				// Flashcard file does not exist
				if (file.name === "Untitled.md") {
					return
				}

				new Notice("Flashcard file does not exist at " + flashcardPath)
				return
			}

			await this.fixTagsInFlashcard(flashcardFile, file)
			await this.fixFlashcardFor(flashcardFile, file)
		}))

		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			if (await this.isNoFlashcardConcept(file)) {
				return
			}

			const ind = this.getConceptPathIndex(file.path)

			if (ind === -1) {
				return
			}

			const oldName = oldPath.split("/").slice(-1)[0]

			if (oldName === "Untitled.md") {
				// This is a new concept
				const flashcardPath = this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(file.name)
				const fileContent = this.app.vault.getAbstractFileByPath(flashcardPath)
				let data = ""

				if (fileContent instanceof TFile) {
					data = await this.app.vault.cachedRead(fileContent)
				} else {
					// new Notice("Could not read content for flashcard at " + flashcardPath)
				}

				const newFilePath = this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(file.name)

				const flashcardFile = await this.app.vault.create(newFilePath, data)

				if (!(file instanceof TFile)) {
					return
				}
				await this.fixTagsInFlashcard(flashcardFile, file)
				await this.fixFlashcardFor(flashcardFile, file)
			} else {
				// This is a rename of an existing concept

				const oldFlashcardFile = this.app.vault.getAbstractFileByPath(this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(oldName))
				if (!(oldFlashcardFile instanceof TFile)) {
					new Notice("Could not find flashcard file to rename at " + this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(oldName))
					return
				}

				if (!(file instanceof TFile)) {
					return
				}

				await this.fixTagsInFlashcard(oldFlashcardFile, file)

				// The delay before is needed for Obsidian to update links before the file renames, probably there is a better way to do this, but this works as it is not time critical
				setTimeout(async () => {
					await this.app.vault.rename(oldFlashcardFile, this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(file.name))
				}, 1000)
			}
		}))

		this.addCommand({
			id: "check-links-and-tags",
			name: "Check links and tags in all flashcards",
			callback: async () => {
				for (let el of this.getConceptsPathsArray()) {
					if (el.endsWith("/")) {
						el = el.slice(0, -1)
					}

					const folder = this.app.vault.getAbstractFileByPath(el)

					if (!(folder instanceof TAbstractFile)) {
						new Notice("Could not find concept folder at " + el)
						continue
					}

					if (!(folder instanceof TFolder)) {
						new Notice("Concepts path is not a folder: " + el)
						continue
					}

					for (const file of folder.children) {
						if (!(file instanceof TFile)) {
							continue
						}

						if (await this.isNoFlashcardConcept(file)) {
							continue
						}

						const flashcardPath = this.getCorrespondingFlashcardPath(file.path) + this.getFlashcardNameFromConcept(file.name)

						const flashcardFile = this.app.vault.getAbstractFileByPath(flashcardPath)
						if (!(flashcardFile instanceof TFile)) {
							new Notice("Could not find flashcard file at " + flashcardPath)
							continue
						}

						await this.fixTagsInFlashcard(flashcardFile, file)
						await this.fixFlashcardFor(flashcardFile, file)
					}
				}

				new Notice("Finished checking links and tags in all flashcards")
			}
		})

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Concepts Paths')
			.setDesc('Space-separated list of paths to watch for concept files')
			.addTextArea(text => text
				.setPlaceholder('Enter paths')
				.setValue(this.plugin.settings.conceptsPaths)
				.onChange(async (value) => {
					this.plugin.settings.conceptsPaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Flashcards Paths')
			.setDesc('Space-separated list of paths to watch for flashcard files. NOTE: this array must correspond to the Concepts Paths array above, i.e. they must have the same number of elements, and the nth element in this array corresponds to the nth element in the Concepts Paths array.')
			.addTextArea(text => text
				.setPlaceholder('Enter paths')
				.setValue(this.plugin.settings.flashcardsPaths)
				.onChange(async (value) => {
					this.plugin.settings.flashcardsPaths = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Flashcard Tags')
			.setDesc('Tags to add to new flashcards.')
			.addTextArea(text => text
				.setPlaceholder('Enter tags')
				.setValue(this.plugin.settings.flashcardTags)
				.onChange(async (value) => {
					this.plugin.settings.flashcardTags = value;
					await this.plugin.saveSettings();
				}));
	}
}
