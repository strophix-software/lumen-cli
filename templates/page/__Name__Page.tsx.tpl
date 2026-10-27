{{clientDirective}}{{importBlock}}export function {{Name}}Page() {
{{pageBody}}  return (
    <div className="container mx-auto px-4 py-8" data-testid="{{nameKebab}}-page">
      <h1 className="text-3xl font-bold tracking-tight mb-4">{{Name}} Page</h1>
{{pageContent}}    </div>
  );
}

export default {{Name}}Page;
