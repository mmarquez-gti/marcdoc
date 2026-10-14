-- Word stores the size of every image, and GFM can only write an image with attributes as raw
-- HTML (<img width=…>). Dropping them keeps imported images as plain Markdown images.
function Image(image)
  image.attributes = {}
  return image
end
