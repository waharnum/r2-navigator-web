import { Publication } from '../../streamer';
import { Location } from '../location';
import { IContentViewFactory } from './content-view/content-view-factory';
import { SpineItemView } from './spine-item-view';
import { SpineItemViewFactory } from './spine-item-view-factory';
import { CancellationToken, ZoomOptions } from './types';
import { View } from './view';

export class PaginationInfo {
  public spineItemIndex: number;
  public spineItemPageCount: number;
  public pageIndex: number;
  public view: SpineItemView;
  public offsetInView: number;
}

class SpineItemViewStatus {
  public view: SpineItemView;
  public viewContainer: HTMLElement;
  public spineItemIndex: number;
  public offset: number;
  public viewSize: number;
}

export class LayoutView extends View {
  private spineItemViewStatus: SpineItemViewStatus[] = [];
  private spineItemViewSizes: number[] = [];
  private spineItemViewPageCounts: number[] = [];

  private host: HTMLElement;
  private layoutRoot: HTMLElement;

  private publication: Publication;

  private contentFactory: IContentViewFactory;

  private isViewSettingChanged: boolean = false;

  private loadedContentRange: [number, number] = [0, 0];
  private paginatedRange: [number, number] = [0, 0];

  private pageWidth: number = 600;
  private pageHeight: number = 800;
  private isPageSizeChanged: boolean = false;

  private inViewUpdate: boolean = false;

  private isVertical: boolean = false;

  private hasUnknownSizeSpineItemLoading: boolean = false;

  private isFixedLayout: boolean = false;
  private zoomOption: ZoomOptions = ZoomOptions.FitByPage;
  private zoomScale: number = 1;

  private spineItemViewFactory: SpineItemViewFactory;

  private isRtl: boolean = false;

  private numOfPagesPerSpread: number = 0;

  public constructor(pub: Publication, cvFactory: IContentViewFactory) {
    super();
    this.publication = pub;
    this.contentFactory = cvFactory;
    this.initSpineItemViews();

    if (this.publication.Metadata.Rendition) {
      this.isFixedLayout = this.publication.Metadata.Rendition.Layout === 'fixed';
    }

    if (this.publication.Metadata.Direction) {
      this.isRtl = this.publication.Metadata.Direction === 'rtl';
    }

    this.spineItemViewFactory = new SpineItemViewFactory(pub,
                                                         this.isFixedLayout,
                                                         cvFactory);

    // tslint:disable-next-line:prefer-array-literal
    this.spineItemViewSizes = new Array<number>(pub.Spine.length).fill(-1);
    // tslint:disable-next-line:prefer-array-literal
    this.spineItemViewPageCounts = new Array<number>(pub.Spine.length).fill(-1);
  }

  public getSpineItemView(spineItemIndex: number): SpineItemView | undefined {
    for (const siv of this.spineItemViewStatus) {
      if (siv.spineItemIndex === spineItemIndex) {
        return siv.view;
      }
    }

    return undefined;
  }

  public getSpineItemViewOffset(spineItemIndex: number): number | undefined {
    for (const siv of this.spineItemViewStatus) {
      if (siv.spineItemIndex === spineItemIndex) {
        return siv.offset;
      }
    }

    return undefined;
  }

  // tslint:disable-next-line:no-any
  public isSpineItemVisible(siIndex: number, viewOffset: number, viewportSize: number): boolean {
    const viewStatus = this.spineItemViewStatus.find((status: SpineItemViewStatus) => {
      return status.spineItemIndex === siIndex;
    });

    if (!viewStatus) {
      return false;
    }

    if (viewStatus.offset + viewStatus.viewSize < viewOffset ||
        viewStatus.offset > viewOffset + viewportSize) {
      return false;
    }

    return true;
  }

  public getOffsetInSpineItemView(siIndex: number, viewOffset: number): number | undefined {
    const viewStatus = this.spineItemViewStatus.find((status: SpineItemViewStatus) => {
      return status.spineItemIndex === siIndex;
    });

    if (!viewStatus) {
      return undefined;
    }

    return viewOffset - viewStatus.offset;
  }

  public findSpineItemIndexByHref(href: string): number {
    return this.publication.findSpineItemIndexByHref(href);
  }

  public isRightToLeft(): boolean {
    return this.isRtl;
  }

  public setPageSize(width: number, height: number): void {
    this.pageWidth = width;
    this.pageHeight = height;
    if (!this.isVertical) {
      this.layoutRoot.style.height = `${this.visualPageHeight()}px`;
    } else {
      this.layoutRoot.style.width = `${this.visualPageWidth()}px`;
    }

    this.isPageSizeChanged = true;

    if (!this.inViewUpdate) {
      this.rePaginate();
      this.isPageSizeChanged = false;
    }
  }

  public setNumberOfPagesPerSpread(num: number): void {
    this.numOfPagesPerSpread = num;
  }

  public numberOfPagesPerSpread(): number {
    return this.numOfPagesPerSpread;
  }

  public beginViewUpdate(): void {
    this.inViewUpdate = true;
  }

  public endViewUpdate(): void {
    if (!this.inViewUpdate) {
      return;
    }

    this.rePaginate();

    this.inViewUpdate = false;
    this.isViewSettingChanged = false;
    this.isPageSizeChanged = false;
  }

  // tslint:disable-next-line:no-any
  public updateViewSettings(viewSetting: any): void {
    if (viewSetting.hasOwnProperty('syntheticSpread')) {
      delete viewSetting.syntheticSpread;
    }

    this.contentFactory.viewSettings().update(viewSetting);
    this.isViewSettingChanged = true;

    if (!this.inViewUpdate) {
      this.rePaginate();
      this.isViewSettingChanged = false;
    }
  }

  // tslint:disable-next-line:no-any
  public viewSettings() : any {
    return this.contentFactory.viewSettings();
  }

  public setZoom(option: ZoomOptions, scale: number): void {
    if (!this.isFixedLayout) {
      return;
    }

    if (this.zoomOption === option && this.zoomScale === scale) {
      return;
    }

    this.zoomOption = option;
    this.zoomScale = scale;

    this.isPageSizeChanged = true;
    this.rePaginate();
    this.isPageSizeChanged = false;
  }

  public getZoomScale(): number {
    return this.zoomScale;
  }

  public getZoomOption(): ZoomOptions {
    return this.zoomOption;
  }

  public setVerticalLayout(v: boolean): void {
    this.isVertical = v;
    this.spineItemViewFactory.setVerticalLayout(v);
  }

  public isVerticalLayout(): boolean {
    return this.isVertical;
  }

  public render(): void {
    return;
  }

  public attachToHost(host: HTMLElement): void {
    this.host = host;
    this.host.appendChild(this.layoutRoot);
  }

  public containerElement(): HTMLElement {
    return this.layoutRoot;
  }

  public hasMoreAfterEnd(): boolean {
    return this.nextIndexAfterEnd() < this.publication.Spine.length;
  }

  public hasMoreBeforeStart(): boolean {
    return this.nextIndexBeforeStart() >= 0;
  }

  public getLoadedStartPostion(): number {
    return this.loadedContentRange[0];
  }

  public getLoadedEndPosition(): number {
    return this.loadedContentRange[1];
  }

  public isEmpty(): boolean {
    return this.loadedContentRange[0] === this.loadedContentRange[1];
  }

  public loadedRangeLength(): number {
    return this.loadedContentRange[1] - this.loadedContentRange[0];
  }

  public paginatedLength(): number {
    return this.paginatedRange[1] - this.paginatedRange[0];
  }

  public getPaginationInfoAtOffset(offset: number): PaginationInfo[] {
    const res: PaginationInfo[] = [];
    if (offset < this.getLoadedStartPostion() || offset > this.getLoadedEndPosition()) {
      return res;
    }

    for (const siv of this.spineItemViewStatus) {
      if (offset >= siv.offset &&
          offset <= siv.offset + siv.viewSize) {
        res.push({
          spineItemIndex: siv.spineItemIndex,
          spineItemPageCount: siv.view.getTotalPageCount(),
          pageIndex: Math.floor((offset - siv.offset) / this.pageWidth),
          view: siv.view,
          offsetInView: offset - siv.offset,
        });
      }
    }

    return res;
  }

  public async getOffsetFromLocation(loc: Location): Promise<number | undefined> {
    const siv = await this.getSpineItemViewStatusFromHref(loc.getHref());
    if (!siv) {
      return undefined;
    }

    const pageIndexOffset = siv.view.getPageIndexOffsetFromCfi(loc.getLocation());

    return siv.offset + pageIndexOffset * this.pageWidth;
  }

  public async getOffsetFromAnchor(href: string,
                                   elementId: string):
                                   Promise<number | undefined> {
    const siv = await this.getSpineItemViewStatusFromHref(href);
    if (!siv) {
      return undefined;
    }

    const pageIndexOffset = siv.view.getPageIndexOffsetFromElementId(elementId);

    return siv.offset + pageIndexOffset * this.pageWidth;
  }

  public async ensureLoaded(token?: CancellationToken): Promise<void> {
    for (const siv of this.spineItemViewStatus) {
      await siv.view.ensureContentLoaded(token);
      if (token && token.isCancelled) {
        break;
      }
    }
  }

  public async ensureConentLoadedAtRange(start: number, end: number,
                                         token?: CancellationToken): Promise<void> {
    // first try to load spine items with known size
    while (end > this.getLoadedEndPosition() && this.hasMoreKnownSizeAfterEnd()) {
      if (token && token.isCancelled) {
        break;
      }
      await this.loadNewSpineItemAtEnd(token);
    }

    while (start < this.getLoadedStartPostion() && this.hasMoreKnowSizeBeforeStart()) {
      if (token && token.isCancelled) {
        break;
      }
      await this.loadNewSpineItemAtStart(token);
    }

    this.updatePaginatedRange();

    while (end > this.getLoadedEndPosition() && this.hasMoreAfterEnd()) {
      if (token && token.isCancelled) {
        break;
      }
      await this.loadNewSpineItemAtEnd(token);
    }

    while (start < this.getLoadedStartPostion() && this.hasMoreBeforeStart()) {
      if (token && token.isCancelled) {
        break;
      }
      await this.loadNewSpineItemAtStart(token);
    }

    this.updatePaginatedRange();
  }

  public async ensureContentLoadedAtSpineItemRange(startIndex: number, endIndex: number,
                                                   token?: CancellationToken): Promise<void> {
    let isEmpty = this.spineItemViewStatus.length === 0;
    if (!isEmpty) {
      if (this.startViewStatus().spineItemIndex > endIndex ||
          this.endViewStatus().spineItemIndex < startIndex) {
        this.clearLoadedContent();
        isEmpty = true;
      }
    }

    if (isEmpty) {
      await this.loadNewSpineItemIndexAtEnd(startIndex, token);
      if (token && token.isCancelled) {
        return;
      }
    }

    const existingStartIndex = this.startViewStatus().spineItemIndex;
    for (let i = existingStartIndex; i > startIndex; i = i - 1) {
      await this.loadNewSpineItemAtStart(token);
      if (token && token.isCancelled) {
        return;
      }
    }

    const existingEndIndex = this.endViewStatus().spineItemIndex;
    for (let i = existingEndIndex; i < endIndex; i = i + 1) {
      await this.loadNewSpineItemAtEnd(token);
      if (token && token.isCancelled) {
        return;
      }
    }
  }

  public adjustLoadedConentRangeToPositive(): number {
    if (this.spineItemViewStatus.length === 0) {
      return 0;
    }

    const adj = this.startViewStatus().offset;
    if (adj > 0) {
      return 0;
    }

    for (const vs of this.spineItemViewStatus) {
      vs.offset -= adj;
      this.postionSpineItemView(vs);
    }

    this.loadedContentRange[0] -= adj;
    this.loadedContentRange[1] -= adj;
    this.paginatedRange[0] -= adj;
    this.paginatedRange[1] -= adj;

    return adj;
  }

  public visiblePages(start: number, end: number): [number, number][] {
    const pageRanges: [number, number][] = [];
    for (const vs of this.spineItemViewStatus) {
      if (vs.offset + vs.viewSize < start) {
        continue;
      }
      if (vs.offset > end) {
        break;
      }

      const pageCount = vs.view.getTotalPageCount();
      const pageSize = vs.view.fixedLayout() ? this.spineItemViewSizes[vs.spineItemIndex] :
                                               vs.view.getPageSize(this.pageWidth);
      for (let i = 1; i <= pageCount; i = i + 1) {
        const pageStart = vs.offset + (i - 1) * pageSize;
        const pageEnd = pageStart + pageSize;
        if (pageStart >= start && pageStart <= end &&
            pageEnd >= start && pageEnd <= end) {
          pageRanges.push([pageStart, pageEnd]);
        }
      }
    }

    return pageRanges;
  }

  public removeOutOfRangeSpineItems(start: number, end: number): void {
    let newStart: number = this.loadedContentRange[1];
    let newEnd: number = this.loadedContentRange[0];
    let hasAnyRemoved: boolean = false;
    for (const vs of this.spineItemViewStatus) {
      const viewEnd = vs.offset + vs.view.getTotalSize(this.pageWidth);
      if (viewEnd < start || vs.offset > end) {
        vs.view.unloadSpineItem();
        if (this.layoutRoot.contains(vs.viewContainer)) {
          this.layoutRoot.removeChild(vs.viewContainer);
        }
        hasAnyRemoved = true;
      } else {
        if (vs.offset < newStart) {
          newStart = vs.offset;
        }
        if (viewEnd > newEnd) {
          newEnd = viewEnd;
        }
      }
    }

    if (hasAnyRemoved) {
      if (newStart >= newEnd) {
        this.loadedContentRange = [0, 0];
      } else {
        this.loadedContentRange = [newStart, newEnd];
      }

      this.spineItemViewStatus = this.spineItemViewStatus.filter((vs: SpineItemViewStatus) => {
        return vs.view.isSpineItemInUse();
      });
    }
  }

  private clearLoadedContent(): void {
    this.spineItemViewStatus.forEach((v: SpineItemViewStatus) => {
      this.layoutRoot.removeChild(v.viewContainer);
    });

    this.spineItemViewStatus = [];
    this.loadedContentRange = [0, 0];
  }

  private visualPageWidth(): number {
    return this.pageWidth * this.zoomScale;
  }

  private visualPageHeight(): number {
    return this.pageHeight * this.zoomScale;
  }

  private initSpineItemViews(): void {
    this.layoutRoot = document.createElement('div');
    this.layoutRoot.setAttribute('id', 'layout-view-root');
    this.layoutRoot.style.transform = 'translateX(0px)';
    // this.layoutRoot.style.position = 'absolute';
  }

  private startViewStatus(): SpineItemViewStatus {
    return this.spineItemViewStatus[0];
  }

  private endViewStatus(): SpineItemViewStatus {
    return this.spineItemViewStatus[this.spineItemViewStatus.length - 1];
  }

  private nextIndexAfterEnd(): number {
    let nextIndex = 0;
    if (this.spineItemViewStatus.length > 0) {
      nextIndex = this.endViewStatus().spineItemIndex + 1;
    }

    return nextIndex;
  }

  private nextIndexBeforeStart(): number {
    let nextIndex = 0;
    if (this.spineItemViewStatus.length > 0) {
      nextIndex = this.startViewStatus().spineItemIndex - 1;
    }

    return nextIndex;
  }

  private hasMoreKnownSizeAfterEnd(): boolean {
    const nextIndex = this.nextIndexAfterEnd();

    return nextIndex < this.spineItemViewSizes.length && this.spineItemViewSizes[nextIndex] > 0;
  }

  private hasMoreKnowSizeBeforeStart(): boolean {
    const nextIndex = this.nextIndexBeforeStart();

    return nextIndex >= 0 && this.spineItemViewSizes[nextIndex] > 0;
  }

  private rePaginate(): void {
    this.spineItemViewSizes.fill(-1);

    if (this.spineItemViewStatus.length === 0) {
      return;
    }

    let offset = this.startViewStatus().offset;
    this.loadedContentRange[0] = this.paginatedRange[0] = offset;
    for (const vs of this.spineItemViewStatus) {
      if (this.isViewSettingChanged) {
        vs.view.setViewSettings(this.contentFactory.viewSettings());
      }

      if (this.isPageSizeChanged) {
        vs.viewContainer.style.width = `${this.visualPageWidth()}px`;
        if (!this.isVertical || this.isFixedLayout) {
          vs.viewContainer.style.height = `${this.visualPageHeight()}px`;
        }

        vs.view.setZoomOption(this.zoomOption);
        vs.view.resize(this.visualPageWidth(), this.visualPageHeight());
      }

      vs.viewSize = vs.view.getTotalSize(this.pageWidth);
      vs.offset = offset;
      this.postionSpineItemView(vs);

      offset += vs.viewSize;
      this.spineItemViewSizes[vs.spineItemIndex] = vs.viewSize;
      this.spineItemViewPageCounts[vs.spineItemIndex] = vs.view.getTotalPageCount();
    }

    this.loadedContentRange[1] = this.paginatedRange[1] = offset;

    this.updatePaginatedRange();
  }

  private updatePaginatedRange(): void {
    this.paginatedRange[0] = Math.min(this.paginatedRange[0], this.loadedContentRange[0]);
    this.paginatedRange[1] = Math.max(this.paginatedRange[1], this.loadedContentRange[1]);

    if (this.isVertical) {
      this.layoutRoot.style.height = `${this.paginatedLength()}px`;
    } else {
      this.layoutRoot.style.width = `${this.paginatedLength()}px`;
    }
  }

  private async loadNewSpineItemAtEnd(token?: CancellationToken): Promise<void> {
    let newSpineItemIndex: number;

    if (this.spineItemViewStatus.length === 0) {
      newSpineItemIndex = 0;
    } else {
      newSpineItemIndex = this.endViewStatus().spineItemIndex + 1;
    }

    if (newSpineItemIndex >= this.publication.Spine.length) {
      return;
    }

    await this.loadNewSpineItemIndexAtEnd(newSpineItemIndex, token);
  }

  private async loadNewSpineItemIndexAtEnd(index: number,
                                           token?: CancellationToken): Promise<void> {
    const newViewStatus = await this.loadNewSpineItem(index, token);
    if (!newViewStatus) {
      return;
    }

    newViewStatus.offset = this.spineItemViewStatus.length === 0 ?
                           0 : this.spineItemViewStatus[0].offset;
    this.spineItemViewStatus.forEach((vs: SpineItemViewStatus) => {
      newViewStatus.offset += vs.viewSize;
    });
    this.addNewViewStatus(newViewStatus);

    this.loadedContentRange[1] = newViewStatus.offset +
                                 newViewStatus.viewSize;

    this.postionSpineItemView(newViewStatus);
  }

  private async loadNewSpineItemAtStart(token?: CancellationToken): Promise<void> {
    let newSpineItemIndex: number;

    if (this.spineItemViewStatus.length === 0) {
      newSpineItemIndex = 0;
    } else {
      newSpineItemIndex = this.startViewStatus().spineItemIndex - 1;
    }

    if (newSpineItemIndex < 0) {
      return;
    }

    await this.loadNewSpineItemIndexAtStart(newSpineItemIndex, token);
  }

  private async loadNewSpineItemIndexAtStart(index: number,
                                             token?: CancellationToken): Promise<void> {
    const newViewStatus = await this.loadNewSpineItem(index, token);
    if (!newViewStatus) {
      return;
    }

    newViewStatus.offset = this.spineItemViewStatus.length === 0 ?
                           0 : this.spineItemViewStatus[0].offset;
    newViewStatus.offset -= newViewStatus.viewSize;

    this.addNewViewStatus(newViewStatus);

    this.loadedContentRange[0] = newViewStatus.offset;

    this.postionSpineItemView(newViewStatus);
  }

  private async loadNewSpineItem(index: number,
                                 token?: CancellationToken):
                                 Promise<SpineItemViewStatus | undefined> {
    if (token && token.isCancelled) {
      return undefined;
    }
    let spineItemView: SpineItemView;
    let spineItemViewContainer: HTMLElement;
    [spineItemView, spineItemViewContainer] =
      this.spineItemViewFactory.createSpineItemView(this.pageWidth, this.pageHeight);

    spineItemViewContainer.setAttribute('id', `spine-item-view-${index}`);

    this.layoutRoot.appendChild(spineItemViewContainer);

    let viewLength: number;
    if (this.spineItemViewSizes[index] > 0) {
      viewLength = this.spineItemViewSizes[index];
      spineItemView.setTotalPageCount(this.spineItemViewPageCounts[index]);
      spineItemView.loadSpineItem(this.publication.Spine[index], token).then(() => {
        this.onSpineItemLoaded(spineItemView);
      });
    } else {
      this.hasUnknownSizeSpineItemLoading = true;
      await spineItemView.loadSpineItem(this.publication.Spine[index], token);
      this.hasUnknownSizeSpineItemLoading = false;

      if (token && token.isCancelled) {
        console.log(`spine item ${index} cancelled and removed`);
        this.layoutRoot.removeChild(spineItemViewContainer);
      } else {
        this.onSpineItemLoaded(spineItemView);
      }

      viewLength = spineItemView.getTotalSize(this.pageWidth);
      this.spineItemViewSizes[index] = viewLength;
      this.spineItemViewPageCounts[index] = spineItemView.getTotalPageCount();
    }

    if (token && token.isCancelled) {
      return undefined;
    }

    return {
      offset: 0,
      viewContainer: spineItemViewContainer,
      spineItemIndex: index,
      view: spineItemView,
      viewSize: viewLength,
    };
  }

  private onSpineItemLoaded(siv: SpineItemView): void {
    if (siv.fixedLayout()) {
      siv.resizeFixedLayoutPage(this.zoomOption,
                                this.visualPageWidth(),
                                this.visualPageHeight());
    }
  }

  private postionSpineItemView(viewStatus: SpineItemViewStatus): void {
    let transformString: string;
    if (this.isVertical) {
      transformString = `translateY(${viewStatus.offset}px)`;
    } else {
      if (this.isRtl) {
        const offset = -viewStatus.offset - viewStatus.viewSize;
        transformString = `translateX(${offset}px)`;
      } else {
        transformString = `translateX(${viewStatus.offset}px)`;
      }
    }

    viewStatus.viewContainer.style.transform = transformString;
  }

  private addNewViewStatus(vs: SpineItemViewStatus): void {
    this.spineItemViewStatus.push(vs);
    this.spineItemViewStatus.sort((a: SpineItemViewStatus, b: SpineItemViewStatus) => {
      return a.offset - b.offset;
    });
  }

  private async getSpineItemViewStatusFromHref(href: string):
                                               Promise<SpineItemViewStatus | undefined> {
    let retSiv: SpineItemViewStatus | undefined;
    const siIndex = this.findSpineItemIndexByHref(href);
    for (const siv of this.spineItemViewStatus) {
      if (siIndex === siv.spineItemIndex) {
        await siv.view.ensureContentLoaded();
        retSiv = siv;
      }
    }

    return retSiv;
  }

}
