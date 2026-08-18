import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
} from "@opentui/core";
import { toError } from "../../src/errors.js";
import { TUI_RUNTIME_HELP, reexecWithBun } from "../../src/tui.js";
import { loadRepoEnv } from "./01-document-swarm/extract.js";
import {
  RECIPES,
  clampSwarmSize,
  cookbookCards,
  cookbookModel,
  docOptionLabel,
  formatCookbookCard,
  hasGatewayKey,
  loadCookbookModels,
  modelSelectOption,
  pickCookbookModel,
  togglePath,
  type AgentSlot,
  type CookbookCard,
  type CookbookDocResult,
  type CookbookRecipe,
} from "./recipes.js";

const theme = {
  bg: "#000000",
  fg: "#ededed",
  muted: "#737373",
  dim: "#525252",
  line: "#262626",
  invert: "#ffffff",
  invertFg: "#000000",
  ok: "#ededed",
  warn: "#a3a3a3",
  error: "#ffffff",
};

const selectLooks = {
  backgroundColor: theme.bg,
  focusedBackgroundColor: theme.bg,
  textColor: theme.muted,
  selectedBackgroundColor: theme.invert,
  selectedTextColor: theme.invertFg,
  descriptionColor: theme.dim,
  selectedDescriptionColor: theme.invertFg,
  showScrollIndicator: false,
  showSelectionIndicator: false,
  wrapSelection: true,
  itemSpacing: 0,
};

type FocusId = "recipe" | "docs" | "model" | "result";
const FOCUS_ORDER: FocusId[] = ["recipe", "docs", "model", "result"];

function panel(ctx: CliRenderer, title: string) {
  return new BoxRenderable(ctx, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "single",
    borderColor: theme.line,
    title,
    titleColor: theme.dim,
    backgroundColor: theme.bg,
    padding: 1,
  });
}

export async function runCookbookTui(): Promise<void> {
  loadRepoEnv();
  const models = await loadCookbookModels();
  let recipe: CookbookRecipe = RECIPES[0]!;
  let docs = await recipe.listDocs();
  let selected = [...docs];
  let size = clampSwarmSize(Number(process.env.OPENEXTRACT_SWARM_SIZE ?? recipe.defaultSize));
  let focus: FocusId = "docs";
  let busy = false;
  let status = "";
  let statusTone: "muted" | "ok" | "warn" | "error" = "muted";

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
    autoFocus: true,
    backgroundColor: theme.bg,
  });

  const mark = new BoxRenderable(renderer, {
    width: 4,
    height: 1,
    backgroundColor: theme.invert,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  });
  mark.add(new TextRenderable(renderer, { content: " OE ", fg: theme.invertFg, bg: theme.invert }));
  const brand = new TextRenderable(renderer, { content: "Cookbook", fg: theme.fg });
  const headerMeta = new TextRenderable(renderer, { content: "", fg: theme.muted });
  const headerRow = new BoxRenderable(renderer, {
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: theme.bg,
    gap: 1,
  });
  headerRow.add(mark);
  headerRow.add(brand);
  const header = new BoxRenderable(renderer, {
    height: 4,
    flexShrink: 0,
    flexDirection: "column",
    backgroundColor: theme.bg,
    border: ["bottom"],
    borderColor: theme.line,
    padding: 1,
    gap: 0,
  });
  header.add(headerRow);
  header.add(headerMeta);

  const recipeSelect = new SelectRenderable(renderer, {
    flexGrow: 1,
    options: RECIPES.map((item) => ({
      name: item.title,
      description: item.blurb,
      value: item.id,
    })),
    showDescription: true,
    ...selectLooks,
    showScrollIndicator: true,
  });
  const recipePanel = panel(renderer, " Recipe");
  recipePanel.flexGrow = 2;
  recipePanel.add(recipeSelect);

  const docSelect = new SelectRenderable(renderer, {
    flexGrow: 1,
    options: [],
    showDescription: false,
    ...selectLooks,
  });
  const docPanel = panel(renderer, " Documents");
  docPanel.flexGrow = 2;
  docPanel.add(docSelect);

  const modelSelect = new SelectRenderable(renderer, {
    flexGrow: 1,
    options: models.map(modelSelectOption),
    showDescription: true,
    ...selectLooks,
    showScrollIndicator: true,
  });
  const selectedModelIndex = Math.max(
    0,
    models.findIndex((model) => model.id === pickCookbookModel(models)),
  );
  if (models.length > 0) modelSelect.setSelectedIndex(selectedModelIndex);
  const modelPanel = panel(renderer, " Model");
  modelPanel.flexGrow = 2;
  modelPanel.add(modelSelect);

  const sidebar = new BoxRenderable(renderer, {
    width: 42,
    flexShrink: 0,
    flexDirection: "column",
    backgroundColor: theme.bg,
    gap: 0,
  });
  sidebar.add(recipePanel);
  sidebar.add(docPanel);
  sidebar.add(modelPanel);

  const resultScroll = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    scrollX: false,
    scrollY: true,
    stickyScroll: false,
    contentOptions: {
      backgroundColor: theme.bg,
      flexDirection: "column",
      gap: 1,
      padding: 0,
    },
    scrollbarOptions: { showArrows: false },
    verticalScrollbarOptions: { showArrows: false },
  });
  const resultPanel = panel(renderer, " Output");
  resultPanel.add(resultScroll);

  const footerHint = new TextRenderable(renderer, {
    content: "R extract   Space toggle   [ ] agents   Tab   Ctrl+C",
    fg: theme.dim,
    height: 1,
    flexShrink: 0,
  });
  const footerSpacer = new BoxRenderable(renderer, {
    flexGrow: 1,
    height: 1,
    flexShrink: 1,
    backgroundColor: theme.bg,
  });
  const footerStatus = new TextRenderable(renderer, {
    content: status,
    fg: theme.muted,
    height: 1,
    flexShrink: 0,
  });
  const footer = new BoxRenderable(renderer, {
    height: 2,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.bg,
    border: ["top"],
    borderColor: theme.line,
    paddingX: 1,
    paddingY: 0,
  });
  footer.add(footerHint);
  footer.add(footerSpacer);
  footer.add(footerStatus);

  const columns = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    backgroundColor: theme.bg,
  });
  columns.add(sidebar);
  columns.add(resultPanel);

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme.bg,
  });
  root.add(header);
  root.add(columns);
  root.add(footer);
  renderer.root.add(root);

  const panels: Record<FocusId, BoxRenderable> = {
    recipe: recipePanel,
    docs: docPanel,
    model: modelPanel,
    result: resultPanel,
  };

  function paintStatus(): void {
    footerStatus.content = status;
    footerStatus.fg =
      statusTone === "error" ? theme.error : statusTone === "ok" ? theme.ok : theme.muted;
  }

  function paintFocus(): void {
    for (const item of [recipePanel, docPanel, modelPanel, resultPanel]) {
      item.borderColor = theme.line;
      item.titleColor = theme.dim;
    }
    const active = panels[focus];
    active.borderColor = theme.invert;
    active.titleColor = theme.fg;
    if (focus === "recipe") recipeSelect.focus();
    else if (focus === "docs") docSelect.focus();
    else if (focus === "model") modelSelect.focus();
    else resultScroll.focus();
  }

  function paintDocs(): void {
    const index = docSelect.getSelectedIndex();
    docSelect.options = docs.map((path) => ({
      name: docOptionLabel(path, selected),
      description: "",
      value: path,
    }));
    if (docs.length > 0) docSelect.setSelectedIndex(Math.min(index, docs.length - 1));
  }

  function selectedModel(): string {
    return String(modelSelect.getSelectedOption()?.value ?? cookbookModel());
  }

  type CardNode = {
    box: BoxRenderable;
    body: TextRenderable;
  };
  const cardNodes = new Map<string, CardNode>();
  let scrolledSource: string | undefined;

  function boardWidth(): number {
    return Math.max(28, (resultScroll.width || 56) - 8);
  }

  function clearBoard(): void {
    for (const node of cardNodes.values()) resultScroll.remove(node.box);
    cardNodes.clear();
    scrolledSource = undefined;
    resultPanel.title = " Output";
  }

  function paintBoard(cards: CookbookCard[]): void {
    const keep = new Set(cards.map((card) => card.source));
    for (const [id, node] of cardNodes) {
      if (keep.has(id)) continue;
      resultScroll.remove(node.box);
      cardNodes.delete(id);
    }
    const width = boardWidth();
    for (const card of cards) {
      const target = formatCookbookCard(card, width);
      const height = Math.max(1, target.split("\n").length);
      let node = cardNodes.get(card.source);
      if (!node) {
        const body = new TextRenderable(renderer, {
          content: target,
          fg: theme.fg,
          wrapMode: "none",
          height,
          flexShrink: 0,
        });
        const box = new BoxRenderable(renderer, {
          id: `card-${card.source}`,
          flexShrink: 0,
          border: true,
          borderStyle: "single",
          borderColor: card.state === "running" ? theme.invert : theme.line,
          title: ` ${card.source}`,
          titleColor: theme.fg,
          backgroundColor: theme.bg,
          padding: 1,
        });
        box.add(body);
        resultScroll.add(box);
        node = { box, body };
        cardNodes.set(card.source, node);
      } else {
        node.box.title = ` ${card.source}`;
        node.box.borderColor = card.state === "running" ? theme.invert : theme.line;
        if (node.body.content !== target) node.body.content = target;
      }
      node.body.height = height;
    }
    resultPanel.title = cards.length > 0 ? ` Output  ${cards.length}` : " Output";
    const running = cards.find((card) => card.state === "running");
    if (running && scrolledSource !== running.source) {
      resultScroll.scrollChildIntoView(`card-${running.source}`);
      scrolledSource = running.source;
    }
  }

  function agentCount(): number {
    return recipe.lockSize ? recipe.defaultSize : size;
  }

  function paintMeta(): void {
    const model = selectedModel();
    const count = agentCount();
    const roles = recipe.lockSize ? recipe.roles(count).join(" · ") : `${count} agent${count === 1 ? "" : "s"}`;
    headerMeta.content = `${roles}  ·  ${selected.length}/${docs.length} docs  ·  ${model}`;
    docPanel.title = ` Documents  ${selected.length}/${docs.length}`;
    modelPanel.title = ` Model  ${models.length}`;
  }

  async function loadRecipe(next: CookbookRecipe): Promise<void> {
    recipe = next;
    size = clampSwarmSize(next.defaultSize);
    docs = await next.listDocs();
    selected = [...docs];
    paintDocs();
    paintMeta();
  }

  async function runNow(): Promise<void> {
    if (busy) return;
    if (!hasGatewayKey()) {
      status = "Add AI_GATEWAY_API_KEY to .env";
      statusTone = "warn";
      paintStatus();
      return;
    }
    if (selected.length === 0) {
      status = "Space to include a document";
      statusTone = "warn";
      paintStatus();
      return;
    }
    const model = selectedModel();
    const count = agentCount();
    const roles = recipe.roles(count);
    busy = true;
    status = "Extracting";
    statusTone = "muted";
    paintStatus();
    let done: CookbookDocResult[] = [];
    let pendingSource: string | undefined;
    let pendingSlots: AgentSlot[] | undefined;
    let clock: ReturnType<typeof setInterval> | null = null;
    const paintLive = () => {
      paintBoard(
        cookbookCards(
          done,
          pendingSource == null || pendingSlots == null
            ? undefined
            : { source: pendingSource, slots: pendingSlots },
          { roles, now: Date.now() },
        ),
      );
    };
    clearBoard();
    focus = "result";
    paintFocus();
    clock = setInterval(paintLive, 200);
    try {
      const ordered = docs.filter((path) => selected.includes(path));
      const results = await recipe.run(model, ordered, {
        size: count,
        onDoc: (source, index, total) => {
          pendingSource = source;
          pendingSlots = Array.from({ length: count }, () => ({ phase: "queued" }));
          status = `${basename(source)}  ${index + 1}/${total}`;
          paintStatus();
          paintLive();
        },
        onAgentStart: ({ source, agentIndex, role }) => {
          const slot = pendingSlots?.[agentIndex];
          if (slot) {
            slot.phase = "running";
            slot.startedAt = Date.now();
          }
          status = `${basename(source)}  ${role} running`;
          paintStatus();
          paintLive();
        },
        onAgent: ({ source, agentIndex, agentTotal, role, result }) => {
          const slot = pendingSlots?.[agentIndex];
          if (slot) {
            slot.phase = result instanceof Error ? "error" : "done";
            slot.result = result;
            slot.finishedAt = Date.now();
          }
          status = `${basename(source)}  ${role}  ${agentIndex + 1}/${agentTotal}`;
          paintStatus();
          paintLive();
        },
        onResult: (next) => {
          done = next;
          pendingSource = undefined;
          pendingSlots = undefined;
          paintLive();
        },
      });
      paintBoard(cookbookCards(results, undefined, { roles }));
      status = `${ordered.length} document${ordered.length === 1 ? "" : "s"}  ·  ${model}`;
      statusTone = "ok";
      paintFocus();
    } catch (error) {
      status = toError(error).message;
      statusTone = "error";
    } finally {
      if (clock) clearInterval(clock);
      busy = false;
      paintStatus();
    }
  }

  recipeSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    const id = String(option?.value ?? "");
    const next = RECIPES.find((item) => item.id === id);
    if (!next || next.id === recipe.id) return;
    void loadRecipe(next);
  });

  modelSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => paintMeta());

  renderer.keyInput.on("keypress", (key) => {
    if (key.name === "tab") {
      key.preventDefault();
      const index = FOCUS_ORDER.indexOf(focus);
      focus = FOCUS_ORDER[(index + (key.shift ? -1 : 1) + FOCUS_ORDER.length) % FOCUS_ORDER.length]!;
      paintFocus();
      return;
    }
    if (!key.ctrl && !key.meta && key.name === "r") {
      key.preventDefault();
      void runNow();
      return;
    }
    if (focus === "docs" && (key.name === "space" || key.raw === " ")) {
      key.preventDefault();
      const path = String(docSelect.getSelectedOption()?.value ?? "");
      if (!path) return;
      selected = togglePath(selected, path);
      paintDocs();
      paintMeta();
      return;
    }
    if (!recipe.lockSize && (key.raw === "[" || key.raw === "]")) {
      key.preventDefault();
      size = clampSwarmSize(size + (key.raw === "]" ? 1 : -1));
      paintMeta();
    }
  });

  paintDocs();
  paintMeta();
  paintStatus();
  paintFocus();

  await new Promise<void>((resolve) => {
    renderer.on("destroy", () => resolve());
  });
}

async function main(): Promise<void> {
  loadRepoEnv();
  try {
    await runCookbookTui();
  } catch (error) {
    const redirected = reexecWithBun();
    if (redirected !== null) process.exit(redirected);
    console.error(`error: failed to start the cookbook TUI (${toError(error).message})`);
    console.error(TUI_RUNTIME_HELP);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
