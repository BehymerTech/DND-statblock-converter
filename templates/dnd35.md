## 🐉 {{name}}
*{{size}} {{type}}{{#if subtype}} ({{subtype}}){{/if}}, {{alignment}}*

| 🛡️ AC | ❤️ HP | 👟 Speed | ⚡ Init | ⚔️ BAB / Grapple | 🏆 CR |
|:-:|:-:|:-:|:-:|:-:|:-:|
|{{ac}}{{#if touch}} (touch {{touch}}{{#if flatFooted}}, flat-footed {{flatFooted}}{{/if}}){{/if}}|{{hpAverage}} ({{hpFormula}})|{{speedText}}|{{initiative}}|{{bab}} / {{grapple}}|{{cr}}|

| 💪 STR | 🏃 DEX | 🫀 CON | 🧠 INT | 👁️ WIS | 🎭 CHA |
|:-:|:-:|:-:|:-:|:-:|:-:|
|{{abilities.str}} ({{mod abilities.str}})|{{abilities.dex}} ({{mod abilities.dex}})|{{abilities.con}} ({{mod abilities.con}})|{{abilities.int}} ({{mod abilities.int}})|{{abilities.wis}} ({{mod abilities.wis}})|{{abilities.cha}} ({{mod abilities.cha}})|

{{#if acNotes}}🧱 **AC Breakdown** {{acNotes}}

{{/if}}🎯 **Saves** {{saves}}

{{#if skillsText}}🛠️ **Skills** {{skillsText}}

{{/if}}{{#if feats}}🏅 **Feats** {{feats}}

{{/if}}{{#if senses}}🔍 **Special Qualities** {{senses}}

{{/if}}{{#if languages}}🗣️ **Languages** {{languages}}

{{/if}}{{#if traits}}### ✨ Traits
{{#each traits}}**{{name}}.** {{text}}

{{/each}}{{/if}}{{#if actions}}### ⚔️ Actions
{{#each actions}}**{{name}}.** {{text}}

{{/each}}{{/if}}