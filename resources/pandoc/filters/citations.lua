-- Pandoc's GFM reader does not know citations, so `[@doe2020, p. 3]` arrives as plain text.
-- This filter finds such bracketed groups and lets Pandoc's own Markdown reader turn them
-- into Cite elements, which --citeproc then formats.

local MAX_ELEMENTS = 64

local function plain_text(element)
  if element.t == 'Str' then return element.text end
  if element.t == 'Space' or element.t == 'SoftBreak' then return ' ' end
  return nil
end

-- A citation key: `@` (optionally after `-`) at the start of the group or after a space or `;`.
local function has_citation_key(group)
  return group:find('^%[%-?@[%w_]') or group:find('[%s;]%-?@[%w_]')
end

local function parse_citation(group)
  local blocks = pandoc.read(group, 'markdown').blocks
  local first = blocks[1]
  if #blocks ~= 1 or first.t ~= 'Para' or #first.content ~= 1 then return nil end
  if first.content[1].t ~= 'Cite' then return nil end
  return first.content[1]
end

-- Reads plain text from `inlines[i]` on until the first `]` after a `[`; nil if other
-- elements (emphasis, links…) interrupt it.
local function collect(inlines, i)
  local text = ''
  for j = i, math.min(#inlines, i + MAX_ELEMENTS) do
    local piece = plain_text(inlines[j])
    if piece == nil then return nil end
    text = text .. piece
    local open = text:find('%[')
    if open and text:find('%]', open) then return text, j end
  end
  return nil
end

function Inlines(inlines)
  local result = pandoc.Inlines {}
  local i = 1
  while i <= #inlines do
    local element = inlines[i]
    local text, last = nil, nil
    if element.t == 'Str' and element.text:find('%[') then text, last = collect(inlines, i) end
    local open = text and text:find('%[')
    local close = text and text:find('%]', open)
    local group = text and text:sub(open, close)
    local cite = group and has_citation_key(group) and parse_citation(group)
    if cite then
      local before, after = text:sub(1, open - 1), text:sub(close + 1)
      if before ~= '' then result:insert(pandoc.Str(before)) end
      result:insert(cite)
      -- What follows the group may hold another citation: scan it again.
      if after ~= '' then
        inlines[last] = pandoc.Str(after)
        i = last
      else
        i = last + 1
      end
    else
      result:insert(element)
      i = i + 1
    end
  end
  return result
end
