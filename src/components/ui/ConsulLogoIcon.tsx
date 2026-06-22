import { cn } from "@/lib/utils"

export function ConsulLogoIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="3 0 18 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={cn("text-primary", className)}
    >
      {/* 
        Modern minimalist C shape representing clinical pathway/network 
        Using crisp geometric curves 
      */}
      <path 
        d="M18.5 7.5C16.5 4.5 12 3.5 8.5 6C5 8.5 4 13.5 6.5 17C9 20.5 14 21.5 17.5 19" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* 
        Terracotta accent dot representing the core AI/node
      */}
      <circle cx="17.5" cy="13.5" r="2.5" className="fill-accent" />
    </svg>
  )
}
