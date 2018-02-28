import { PublicationLink } from 'r2-shared-js';
import { IFrameLoader } from '../iframe-loader';
import { ZoomOptions } from './types';
import { View } from './view';

import {
  OnePageView,
  PaginationChangedEventArgs,
  ReflowableView,
  StyleCollection,
  ViewerSettings,
} from 'readium-shared-js';

export enum ContentLoadingStatus {
  NotLoaded,
  Loading,
  Loaded,
}

export class SpineItemView extends View {
  protected host: HTMLElement;

  protected iframeLoader: IFrameLoader;

  protected spine: PublicationLink[];
  // tslint:disable-next-line:no-any
  protected rsjSpine: any;

  // tslint:disable-next-line:no-any
  protected rsjViewSettings: any;

  protected spineItem: PublicationLink;
  protected spineItemIndex: number;
  protected spineItemPageCount: number = 0;

  protected isInUse: boolean = true;

  protected contentStatus: ContentLoadingStatus = ContentLoadingStatus.NotLoaded;

  protected isVertical: boolean = true;

  protected isFixedLayout: boolean = false;
  protected scaleOption: ZoomOptions = ZoomOptions.FitByPage;
  protected scale: number = 1;

  protected contentHeight: number = 0;

  // tslint:disable-next-line:no-any
  protected contentViewImpl: any;

  public constructor(
    iframeLoader: IFrameLoader,
    spine: PublicationLink[],
    // tslint:disable-next-line:no-any
    rsjSpine: any,
    // tslint:disable-next-line:no-any
    rsjViewSetting: any,
    isVertical: boolean,
    isFixedLayout: boolean,
  ) {
    super();
    this.iframeLoader = iframeLoader;
    this.spine = spine;
    this.rsjSpine = rsjSpine;
    this.rsjViewSettings = rsjViewSetting;
    this.isVertical = isVertical;
    this.isFixedLayout = isFixedLayout;
  }

  public loadSpineItem(spineItem: PublicationLink): Promise<void> {
    this.spineItemIndex = this.spine.indexOf(spineItem);

    const readiumViewParams = {
      $viewport: this.host,
      spine: this.rsjSpine,
      userStyles: new StyleCollection(),
      bookStyles: new StyleCollection(),
      iframeLoader: this.iframeLoader,
      expandDocumentFullWidth: true,
    };

    this.contentStatus = ContentLoadingStatus.Loading;

    const reader = {
      fonts: {},
      viewerSettings: () => this.rsjViewSettings,
      needsFixedLayoutScalerWorkAround: () => false,
    };

    return this.isVertical || this.isFixedLayout
      ? this.loadSpineItemOnePageView(readiumViewParams, reader)
      : this.laodSpineItemReflowableView(readiumViewParams, reader);
  }

  public unloadSpineItem(): void {
    while (this.host.firstChild) {
      this.host.removeChild(this.host.firstChild);
    }
    this.isInUse = false;
  }

  public isSpineItemInUse(): boolean {
    return this.isInUse;
  }

  public fixedLayout(): boolean {
    return this.isFixedLayout;
  }

  public ensureContentLoaded(): Promise<void> {
    if (this.contentStatus === ContentLoadingStatus.Loaded) {
      return Promise.resolve();
    }

    if (this.contentStatus === ContentLoadingStatus.Loading) {
      return this.paginationChangedPromise();
    }

    return Promise.reject('Not loaded');
  }

  public resize(pageWidth: number, pageHeight: number): void {
    if (this.isFixedLayout) {
      this.resizeFixedLayoutPage(this.scaleOption, pageWidth, pageHeight);
    } else if (!this.isVertical) {
      this.contentViewImpl.onViewportResize();

      const pageInfo = this.contentViewImpl.getPaginationInfo().openPages[0];
      this.spineItemPageCount = pageInfo.spineItemPageCount;
    }
  }

  public getScale(): number {
    return this.scale;
  }

  public setZoomOption(option: ZoomOptions): void {
    this.scaleOption = option;
  }

  public resizeFixedLayoutPage(option: ZoomOptions, pageWidth: number, pageHeight: number): void {
    if (option === ZoomOptions.Free) {
      return;
    }

    this.scaleOption = option;

    const hScale = pageWidth / this.contentViewImpl.meta_width();
    const vScale = pageHeight / this.contentViewImpl.meta_height();
    if (this.scaleOption === ZoomOptions.FitByPage) {
      this.scale = this.isVertical ? hScale : Math.min(hScale, vScale);
    } else if (this.scaleOption === ZoomOptions.FitByWidth) {
      this.scale = hScale;
    } else if (this.scaleOption === ZoomOptions.FitByHeight) {
      this.scale = vScale;
    }

    this.updateScale();
  }

  public setViewSettings(viewSetting: object): Promise<void> {
    this.rsjViewSettings = viewSetting;

    this.contentViewImpl.setViewSettings(this.rsjViewSettings);

    return this.isVertical || this.isFixedLayout
      ? this.contentSizeChangedPromise() : this.paginationChangedPromise();
  }

  public render(): void {
    this.contentViewImpl.render();
  }

  public attatchToHost(host: HTMLElement): void {
    this.host = host;
  }

  public getTotalPageCount(): number {
    return this.spineItemPageCount;
  }

  public getTotalSize(pageWidth: number): number {
    if (this.isVertical) {
      if (this.isFixedLayout) {
        return this.contentViewImpl.meta_height() * this.scale;
      }

      return this.contentHeight;
    }

    if (this.isFixedLayout) {
      return this.contentViewImpl.meta_width() * this.scale;
    }

    return this.spineItemPageCount * pageWidth;
  }

  public getCfi(offsetMain: number, offset2nd: number): string {
    const navLogic = this.contentViewImpl.getNavigator();

    const visOffset = this.isVertical ? { top: offsetMain, left: offset2nd } :
                                        { top: offset2nd, left: offsetMain };

    return navLogic.getFirstVisibleCfi(visOffset);
  }

  // tslint:disable-next-line:no-any
  private loadSpineItemOnePageView(params: any, reader: any): Promise<void> {
    this.contentViewImpl = new OnePageView(params,
                                           ['content-doc-frame'],
                                           !this.isFixedLayout,
                                           reader);

    this.contentViewImpl.render();

    this.contentViewImpl.setViewSettings(this.rsjViewSettings, true);

    this.host.appendChild(this.contentViewImpl.element()[0]);

    return new Promise((resolve: () => void) => {
      this.contentViewImpl.loadSpineItem(
        this.rsjSpine.items[this.spineItemIndex],
        (success: boolean) => {
          if (success) {
            this.onSpineItemOnePageViewLoaded();
            resolve();
          }
        },
      );
    });
  }

  private onSpineItemOnePageViewLoaded(): void {
    this.spineItemPageCount = 1;
    this.contentViewImpl.resizeIFrameToContent();
    this.contentHeight = this.contentViewImpl.getCalculatedPageHeight();
  }

  // tslint:disable-next-line:no-any
  private laodSpineItemReflowableView(params: any, reader: any): Promise<void> {
    this.contentViewImpl = new ReflowableView(params, reader);

    this.contentViewImpl.render();

    this.contentViewImpl.setViewSettings(this.rsjViewSettings, true);

    this.contentViewImpl.openPage({ spineItem: this.rsjSpine.items[this.spineItemIndex] });

    return this.paginationChangedPromise();
  }

  private paginationChangedHanlder(
    paras: PaginationChangedEventArgs,
    handler: (paras: PaginationChangedEventArgs) => void,
    resolve: () => void,
  ): void {
    const readium = this.getReadium();
    const pageInfo = paras.paginationInfo.openPages[0];
    if (pageInfo.spineItemIndex === this.spineItemIndex) {
      this.contentViewImpl.removeListener(
        readium.InternalEvents.CURRENT_VIEW_PAGINATION_CHANGED,
        handler,
      );
      this.spineItemPageCount = pageInfo.spineItemPageCount;
      this.contentStatus = ContentLoadingStatus.Loaded;
      console.log(`spine item ${this.spineItemIndex} loaded: ${this.spineItemPageCount} pages`);
      resolve();
    }
  }

  private paginationChangedPromise(): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      const handler = (paras: PaginationChangedEventArgs) => {
        this.paginationChangedHanlder(paras, handler, resolve);
      };
      this.contentViewImpl.on(
        this.getReadium().InternalEvents.CURRENT_VIEW_PAGINATION_CHANGED,
        handler,
      );
    });
  }

  // tslint:disable-next-line:no-any
  private contentSizeChangedHandler(iframe: any, spineItem: any, handler: any,
                                    resolve: () => void): void {
    if (this.rsjSpine.items[this.spineItemIndex] !== spineItem) {
      return;
    }

    this.contentViewImpl.resizeIFrameToContent();
    this.contentHeight = this.contentViewImpl.getCalculatedPageHeight();

    this.contentViewImpl.removeListener(
      OnePageView.Events.CONTENT_SIZE_CHANGED,
      handler,
    );
    resolve();
  }

  private contentSizeChangedPromise(): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      // tslint:disable-next-line:no-any
      const handler = (iframe: any, spineItem: any) => {
        this.contentSizeChangedHandler(iframe, spineItem, handler, resolve);
      };
      this.contentViewImpl.on(
        OnePageView.Events.CONTENT_SIZE_CHANGED,
        handler,
      );
    });
  }

  // tslint:disable-next-line:no-any
  private getReadium(): any {
    // tslint:disable-next-line:no-any
    return (<any>window).ReadiumSDK;
  }

  private updateScale(): void {
    if (!this.isFixedLayout) {
      return;
    }

    this.contentViewImpl.transformContentImmediate(this.scale, 0, 0);
  }
}
