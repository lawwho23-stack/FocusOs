import Sidebar from "@/components/sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl items-start gap-4 p-4 pb-24 md:pb-4">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
