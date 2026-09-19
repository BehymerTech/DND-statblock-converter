// Minimal searchable dropdown — the README asks for "a drop down with
// search" for system pickers as well as monster search, so one small
// component backs both instead of a native <select> for the systems and a
// bespoke widget for monsters.

export function createCombobox(container, { placeholder = "", getOptions, onSelect, maxResults = 50 }) {
	container.innerHTML = "";
	const input = document.createElement("input");
	input.type = "text";
	input.placeholder = placeholder;
	input.autocomplete = "off";
	const list = document.createElement("ul");
	list.className = "combobox-list";
	list.hidden = true;
	container.append(input, list);

	let options = [];
	let activeIndex = -1;
	let selectedValue = null;

	function renderOptions(query) {
		options = (getOptions(query) || []).slice(0, maxResults);
		list.innerHTML = "";
		activeIndex = -1;
		if (!options.length) {
			list.hidden = true;
			return;
		}
		options.forEach((opt, idx) => {
			const li = document.createElement("li");
			li.className = "combobox-option";
			li.setAttribute("role", "option");
			const label = document.createElement("span");
			label.textContent = opt.label;
			li.appendChild(label);
			if (opt.meta) {
				const meta = document.createElement("span");
				meta.className = "meta";
				meta.textContent = opt.meta;
				li.appendChild(meta);
			}
			li.addEventListener("mousedown", (e) => {
				e.preventDefault();
				select(idx);
			});
			list.appendChild(li);
		});
		list.hidden = false;
	}

	function select(idx) {
		const opt = options[idx];
		if (!opt) return;
		selectedValue = opt.value;
		input.value = opt.label;
		list.hidden = true;
		onSelect?.(opt.value, opt.label, opt);
	}

	function setActive(idx) {
		[...list.children].forEach((li, i) => li.classList.toggle("active", i === idx));
		activeIndex = idx;
		list.children[idx]?.scrollIntoView({ block: "nearest" });
	}

	input.addEventListener("input", () => {
		selectedValue = null;
		renderOptions(input.value.trim());
	});
	input.addEventListener("focus", () => renderOptions(input.value.trim()));
	input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 100));
	input.addEventListener("keydown", (e) => {
		if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) renderOptions(input.value.trim());
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive(Math.min(activeIndex + 1, options.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive(Math.max(activeIndex - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (activeIndex >= 0) select(activeIndex);
		} else if (e.key === "Escape") {
			list.hidden = true;
		}
	});

	return {
		setValue(value, label) {
			selectedValue = value;
			input.value = label;
		},
		getValue: () => selectedValue,
		getInput: () => input,
		clear() {
			selectedValue = null;
			input.value = "";
		},
	};
}
