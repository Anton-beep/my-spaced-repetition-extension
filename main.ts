import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile } from 'obsidian';
import isSubPath from 'utils/isSubPath';

interface MyPluginSettings {
	conceptsPaths: string;
	flashcardsPaths: string;
	flashcardContentsPaths: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	conceptsPaths: 'this/is/an/example/concepts/',
	flashcardsPaths: 'this/is/an/example/flashcards/',
	flashcardContentsPaths: 'flashcardsTemplates/template.md'
}



export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	isFileInConcepts(filePath: string): boolean {
		return this.settings.conceptsPaths.split(" ").some((p: string) => isSubPath(p, filePath))
	}

	getConceptPathIndex(filePath: string): number {
		return this.settings.conceptsPaths.split(" ").findIndex((p: string) => isSubPath(p, filePath))
	}


	async onload() {
		await this.loadSettings();

		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			let ind = this.getConceptPathIndex(file.path)

			if (ind != -1) {
				let oldName = oldPath.split("/").slice(-1)[0]

				if (oldName === "Untitled.md") {
					// This is a new concept
					let fileContent = this.app.vault.getAbstractFileByPath(this.settings.flashcardContentsPaths.split(" ")[ind])
					let data: string = ""

					if (fileContent instanceof TFile) {
						data = await this.app.vault.cachedRead(fileContent)
					} else {
						new Notice("Could not read content for flashcard at " + this.settings.flashcardContentsPaths.split(" ")[ind])
					}

					let newFilePath = this.settings.flashcardsPaths.split(" ")[ind] + "F " + file.name
					this.app.vault.create(newFilePath, data)
				} else {
					// This is a rename of an existing concept

					let oldFlashcardFile = this.app.vault.getAbstractFileByPath(this.settings.flashcardsPaths.split(" ")[ind] + "F " + oldName)
					if (!(oldFlashcardFile instanceof TFile)) {
						new Notice("Could not find flashcard file to rename at " + this.settings.flashcardsPaths.split(" ")[ind] + "F " + oldName)
						return
					}

					this.app.vault.rename(oldFlashcardFile, this.settings.flashcardsPaths.split(" ")[ind] + "F " + file.name)
				}
			}
		}))

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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
			.setName('Flashcard Contents Paths')
			.setDesc('Space-separated list of paths to watch for flashcard contents files. NOTE: this array must correspond to the Concepts Paths array above, i.e. they must have the same number of elements, and the nth element in this array corresponds to the nth element in the Concepts Paths array.')
			.addTextArea(text => text
				.setPlaceholder('Enter paths')
				.setValue(this.plugin.settings.flashcardContentsPaths)
				.onChange(async (value) => {
					this.plugin.settings.flashcardContentsPaths = value;
					await this.plugin.saveSettings();
				}));
	}
}
