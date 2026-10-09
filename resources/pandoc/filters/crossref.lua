-- Cross-references in pandoc-crossref style for GFM documents (ADR-0004):
--
--   ![Caption](plot.png){#fig:results}        a numbered figure
--   Table: Caption {#tbl:sales}               caption of the table right before or after it
--   See [@fig:results] and [@tbl:sales].      references, numbered in document order
--
-- Runs after citations.lua (which turns [@…] into Cite elements) and before --citeproc.
-- In LaTeX, \caption numbers figures and tables itself, so references become \ref{…}.

local LABEL = '^{#(%a+):([%w_%-%.:]+)}$'
local KINDS = { fig = true, tbl = true }

local NAMES = {
  es = {
    fig = { caption = 'Figura', single = 'figura', plural = 'figuras' },
    tbl = { caption = 'Tabla', single = 'tabla', plural = 'tablas' },
    conjunction = ' y ',
  },
  en = {
    fig = { caption = 'Figure', single = 'Figure', plural = 'Figures' },
    tbl = { caption = 'Table', single = 'Table', plural = 'Tables' },
    conjunction = ' and ',
  },
}

local is_latex = FORMAT:match('latex') ~= nil

local function language(meta)
  local lang = meta.lang and pandoc.utils.stringify(meta.lang) or ''
  return lang:match('^es') and NAMES.es or NAMES.en
end

local function trim_trailing_space(inlines)
  while #inlines > 0 and (inlines[#inlines].t == 'Space' or inlines[#inlines].t == 'SoftBreak') do
    inlines:remove(#inlines)
  end
  return inlines
end

-- Kind and id of a trailing `{#kind:id}` label, and the inlines before it.
local function split_label(inlines)
  local content = trim_trailing_space(inlines:clone())
  local last = content[#content]
  if not last or last.t ~= 'Str' then return nil end
  local kind, id = last.text:match(LABEL)
  if not kind or not KINDS[kind] then return nil end
  content:remove(#content)
  return kind, kind .. ':' .. id, trim_trailing_space(content)
end

local function caption_with_number(names, kind, number, inlines)
  if is_latex then return inlines end
  local result = pandoc.Inlines { pandoc.Str(names[kind].caption .. ' ' .. number .. ':'), pandoc.Space() }
  result:extend(inlines)
  return result
end

-- A paragraph holding only an image and a fig label becomes a numbered Figure.
local function as_figure(block, state)
  if block.t ~= 'Para' then return nil end
  local kind, id, rest = split_label(block.content)
  if kind ~= 'fig' or #rest ~= 1 or rest[1].t ~= 'Image' then return nil end
  state.count.fig = state.count.fig + 1
  state.numbers[id] = state.count.fig
  local image = rest[1]
  local caption = caption_with_number(state.names, 'fig', state.count.fig, image.caption:clone())
  if is_latex then
    -- The id becomes \\label{…} inside the figure environment.
    return pandoc.Figure({ pandoc.Plain { image } }, { long = { pandoc.Plain(caption) } }, pandoc.Attr(id))
  end
  -- Word only gets a bookmark (link target) for a Div with an id, not for a Figure.
  return pandoc.Div({ pandoc.Figure({ pandoc.Plain { image } }, { long = { pandoc.Plain(caption) } }) }, pandoc.Attr(id))
end

-- A paragraph `Table: caption {#tbl:id}`; returns its caption inlines and label (may be nil).
local function table_caption(block)
  if block.t ~= 'Para' or #block.content < 1 then return nil end
  local first = block.content[1]
  if first.t ~= 'Str' or first.text ~= 'Table:' then return nil end
  local inlines = block.content:clone()
  inlines:remove(1)
  if inlines[1] and inlines[1].t == 'Space' then inlines:remove(1) end
  local kind, id, rest = split_label(inlines)
  if kind == 'tbl' then return rest, id end
  return trim_trailing_space(inlines), nil
end

local function caption_table(tbl, inlines, id, state)
  local caption = inlines
  if id then
    state.count.tbl = state.count.tbl + 1
    state.numbers[id] = state.count.tbl
    caption = caption_with_number(state.names, 'tbl', state.count.tbl, inlines)
    tbl.attr = pandoc.Attr(id)
  end
  tbl.caption = { long = { pandoc.Plain(caption) } }
  return tbl
end

-- Numbers figures and tables in document order, recursing into containers.
local function number_blocks(blocks, state)
  local result = pandoc.Blocks {}
  local i = 1
  while i <= #blocks do
    local block = blocks[i]
    local figure = as_figure(block, state)
    local caption, id = table_caption(block)
    local next_block = blocks[i + 1]
    local previous = result[#result]
    if figure then
      result:insert(figure)
    elseif caption and next_block and next_block.t == 'Table' then
      result:insert(caption_table(next_block, caption, id, state))
      i = i + 1
    elseif caption and previous and previous.t == 'Table' and #previous.caption.long == 0 then
      caption_table(previous, caption, id, state)
    else
      if block.t == 'BlockQuote' or block.t == 'Div' then
        block.content = number_blocks(block.content, state)
      elseif block.t == 'BulletList' or block.t == 'OrderedList' then
        for index, item in ipairs(block.content) do block.content[index] = number_blocks(item, state) end
      end
      result:insert(block)
    end
    i = i + 1
  end
  return result
end

local function reference_kind(citation)
  local kind = citation.id:match('^(%a+):')
  return KINDS[kind] and kind or nil
end

-- "1", "1 y 2", "1, 2 y 3"
local function join_list(items, conjunction)
  if #items == 1 then return items[1] end
  return table.concat(items, ', ', 1, #items - 1) .. conjunction .. items[#items]
end

-- Consecutive references of one kind, e.g. {kind = 'fig', ids = {'fig:a', 'fig:b'}}.
local function group_by_kind(citations)
  local groups = {}
  for _, citation in ipairs(citations) do
    local kind = reference_kind(citation)
    local last = groups[#groups]
    if last and last.kind == kind then
      table.insert(last.ids, citation.id)
    else
      table.insert(groups, { kind = kind, ids = { citation.id } })
    end
  end
  return groups
end

-- "figura 1" / "figuras 1 y 2", linked to the first one (LaTeX: \ref, numbered by LaTeX).
local function render_group(group, state)
  local names = state.names[group.kind]
  local label = #group.ids == 1 and names.single or names.plural
  local items = {}
  for _, id in ipairs(group.ids) do
    if not state.numbers[id] then
      io.stderr:write('[WARNING] Cross-reference ' .. id .. ' not found\n')
      table.insert(items, '??')
    elseif is_latex then
      table.insert(items, '\\ref{' .. id .. '}')
    else
      table.insert(items, tostring(state.numbers[id]))
    end
  end
  local list = join_list(items, state.names.conjunction)
  if is_latex then return pandoc.RawInline('latex', label .. '~' .. list) end
  -- A broken reference must not link to a target that does not exist.
  if not state.numbers[group.ids[1]] then return pandoc.Str(label .. ' ' .. list) end
  return pandoc.Link(label .. ' ' .. list, '#' .. group.ids[1])
end

-- Replaces a Cite made only of fig/tbl keys; other Cites are left to citeproc.
local function resolve(cite, state)
  for _, citation in ipairs(cite.citations) do
    if not reference_kind(citation) then return nil end
  end
  local result = pandoc.Inlines {}
  local first, last = cite.citations[1], cite.citations[#cite.citations]
  if #first.prefix > 0 then
    result:extend(first.prefix)
    result:insert(pandoc.Space())
  end
  for index, group in ipairs(group_by_kind(cite.citations)) do
    if index > 1 then
      result:insert(pandoc.Str(','))
      result:insert(pandoc.Space())
    end
    result:insert(render_group(group, state))
  end
  result:extend(last.suffix)
  return result
end

-- babel calls Spanish tables "Cuadro"; references say "tabla", so captions must match.
local SPANISH_TABLE_NAME = '\\addto\\captionsspanish{\\renewcommand{\\tablename}{Tabla}}'

local function add_header_include(meta, latex)
  local includes = meta['header-includes']
  if includes == nil then
    includes = pandoc.MetaList {}
  elseif includes.t ~= 'MetaList' and pandoc.utils.type(includes) ~= 'List' then
    includes = pandoc.MetaList { includes }
  end
  includes:insert(pandoc.MetaBlocks { pandoc.RawBlock('latex', latex) })
  meta['header-includes'] = includes
end

function Pandoc(doc)
  local state = { names = language(doc.meta), count = { fig = 0, tbl = 0 }, numbers = {} }
  if is_latex and state.names == NAMES.es then add_header_include(doc.meta, SPANISH_TABLE_NAME) end
  doc.blocks = number_blocks(doc.blocks, state)
  return doc:walk {
    Cite = function(cite) return resolve(cite, state) end,
  }
end
