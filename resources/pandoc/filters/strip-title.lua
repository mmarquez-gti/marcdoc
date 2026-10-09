-- The cover page comes from the Word template, so Pandoc must not emit its own title block.
function Meta(meta)
  for _, key in ipairs({ 'title', 'subtitle', 'author', 'date', 'abstract' }) do
    meta[key] = nil
  end
  return meta
end
