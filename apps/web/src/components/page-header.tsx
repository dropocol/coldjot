interface PageHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface PageHeaderTitleProps {
  children: React.ReactNode;
}

interface PageHeaderDescriptionProps {
  children: React.ReactNode;
}

export function PageHeader({ children, className: _className }: PageHeaderProps) {
  return (
    <div className="border-b">
      <div className="container py-6">{children}</div>
    </div>
  );
}

PageHeader.Title = function PageHeaderTitle({
  children,
}: PageHeaderTitleProps) {
  return <h1 className="text-2xl font-semibold">{children}</h1>;
};

PageHeader.Description = function PageHeaderDescription({
  children,
}: PageHeaderDescriptionProps) {
  return <p className="text-muted-foreground mt-2">{children}</p>;
};
