import { ShieldCheck, Server, HelpCircle, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function DashboardFooter() {
  return (
    <footer className="border-t border-border bg-card/50 backdrop-blur-sm">
      <div className="px-6 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">EnvioFleet</p>
              <p className="text-xs text-muted-foreground">Secure Admin Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <FileText className="h-3.5 w-3.5" />
              Documentation
            </a>
            <a href="#" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />
              Support
            </a>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              <span>System Status</span>
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-status-active opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-active"></span>
              </span>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} EnvioLogistics Inc. All Rights Reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
