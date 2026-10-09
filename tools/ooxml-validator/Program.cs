// Validates .docx files against the OOXML schema and semantic rules using the Open XML SDK,
// the same library Microsoft Office tooling relies on.
// Usage: OoxmlValidator [--json] [--version Microsoft365|Office2019|...] <file.docx>...
// Exit code: 0 = all valid, 1 = validation errors, 2 = usage or I/O error.
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

const int MaxErrorsPerFile = 200;

var json = false;
var version = FileFormatVersions.Microsoft365;
var files = new List<string>();

for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--json":
            json = true;
            break;
        case "--version" when i + 1 < args.Length:
            if (!Enum.TryParse(args[++i], out version))
            {
                Console.Error.WriteLine($"Unknown file format version: {args[i]}");
                return 2;
            }
            break;
        default:
            files.Add(args[i]);
            break;
    }
}

if (files.Count == 0)
{
    Console.Error.WriteLine("Usage: OoxmlValidator [--json] [--version Microsoft365] <file.docx>...");
    return 2;
}

var validator = new OpenXmlValidator(version) { MaxNumberOfErrors = MaxErrorsPerFile };
var results = new List<object>();
var anyInvalid = false;

foreach (var file in files)
{
    try
    {
        using var document = WordprocessingDocument.Open(file, isEditable: false);
        var errors = validator.Validate(document).Select(error => new
        {
            id = error.Id,
            type = error.ErrorType.ToString(),
            description = error.Description,
            part = error.Part?.Uri.ToString(),
            path = error.Path?.XPath,
        }).ToList();

        anyInvalid |= errors.Count > 0;
        results.Add(new { file, valid = errors.Count == 0, errors });

        if (!json)
        {
            Console.WriteLine($"{(errors.Count == 0 ? "OK  " : "FAIL")} {file} ({errors.Count} errors)");
            foreach (var error in errors)
            {
                Console.WriteLine($"  [{error.type}] {error.part} {error.path}\n    {error.description}");
            }
        }
    }
    catch (Exception exception) when (exception is IOException or OpenXmlPackageException or InvalidDataException)
    {
        Console.Error.WriteLine($"Cannot open {file}: {exception.Message}");
        return 2;
    }
}

if (json)
{
    Console.WriteLine(JsonSerializer.Serialize(results, new JsonSerializerOptions { WriteIndented = true }));
}

return anyInvalid ? 1 : 0;
