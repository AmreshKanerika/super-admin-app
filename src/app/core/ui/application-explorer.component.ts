import { Component, Input, Output, EventEmitter, TemplateRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
export interface ExplorerNode {
  id: string; name: string; depth: number; hasChildren: boolean; expanded: boolean;
  status: string; data: any; dirty?: boolean; path?: string;
}
@Component({
  selector: 'app-application-explorer', standalone: true, imports: [CommonModule],
  templateUrl: './application-explorer.component.html',
  styleUrl: './application-explorer.component.scss'
})
export class ApplicationExplorerComponent {
  @Input() nodes: ExplorerNode[] = [];
  @Input({required:true}) detail!: TemplateRef<any>;
  @Input() query = '';
  @Input() loading = false;
  @Output() queryChange = new EventEmitter<string>();
  @Output() toggle = new EventEmitter<string>();
  @Output() expandAll = new EventEmitter<void>();
  @Output() collapseAll = new EventEmitter<void>();
  selectedId = signal('');
  selected(): ExplorerNode | undefined { return this.nodes.find(n => n.id === this.selectedId()) ?? this.nodes[0]; }
  trackNode = (_:number,n:ExplorerNode) => n.id;
  toggleNode(node:ExplorerNode): void {
    const from=this.nodes.indexOf(node), selected=this.nodes.findIndex(n=>n.id===this.selected()?.id);
    let end=from+1; while(end<this.nodes.length && this.nodes[end].depth>node.depth) end++;
    if(node.expanded && selected>from && selected<end) this.selectedId.set(node.id);
    this.toggle.emit(node.id);
  }
  key(event:KeyboardEvent,node:ExplorerNode):void {
    const i=this.nodes.indexOf(node); let next=i;
    if(event.key==='ArrowDown') next=Math.min(i+1,this.nodes.length-1);
    else if(event.key==='ArrowUp') next=Math.max(0,i-1);
    else if(event.key==='Home') next=0;
    else if(event.key==='End') next=this.nodes.length-1;
    else if(event.key==='ArrowRight') {
      if(node.hasChildren && !node.expanded) this.toggleNode(node);
      else if(node.hasChildren) next=Math.min(i+1,this.nodes.length-1);
    } else if(event.key==='ArrowLeft') {
      if(node.hasChildren && node.expanded) this.toggleNode(node);
      else { for(let j=i-1;j>=0;j--) if(this.nodes[j].depth<node.depth){next=j;break;} }
    } else if(event.key==='Enter'||event.key===' ') this.selectedId.set(node.id);
    else return;
    event.preventDefault();
    const target=(event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement|undefined;
    target?.focus();
  }
}
