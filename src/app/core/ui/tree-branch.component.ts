import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
@Component({selector:'app-tree-branch',standalone:true,imports:[NgFor,NgIf],
template:`<span class="rail" *ngFor="let on of rails.slice(1)" [class.on]="on"></span><span *ngIf="depth > 0" class="elbow" [class.last]="last"></span>`,host:{'aria-hidden':'true'},
styles:[`:host{color:var(--tree-rail, #c5cbd9);display:flex;align-self:stretch;flex:none;min-height:26px;margin-block:calc(-1 * var(--tree-rail-bleed, 14px))}.rail,.elbow{width:22px;position:relative;flex:none}.on:before,.elbow:before{content:'';position:absolute;left:10px;top:0;bottom:0;border-left:1px solid currentColor}.elbow.last:before{bottom:50%}.elbow:after{content:'';position:absolute;left:10px;right:0;top:50%;border-top:1px solid currentColor}`]})
export class TreeBranchComponent{@Input() rails:boolean[]=[];@Input() depth=0;@Input() last=false;}
